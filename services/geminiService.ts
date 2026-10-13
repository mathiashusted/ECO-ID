import { GoogleGenAI, Type } from "@google/genai";
import { GeminiApiResponse, ApiProvider, OntologyType } from "../types";

// Thesis experiment arm - will be changed directly from here and affects the prompt as well as the schema:
// A = LLM-as-DB, B = hybrid
export const EXPERIMENT_ARM = "A" as "A" | "B";

// --- Gemini-Specific Implementation ---

const getGeminiClient = (apiKey?: string) => {
    const key = apiKey || process.env.API_KEY as string;
    if (!key) {
        throw new Error("API key is not provided. Please set it in the API Settings or environment variables.");
    }
    return new GoogleGenAI({ apiKey: key });
};

const getResponseSchema = (ontology: OntologyType) => {
    const schema = {
        type: Type.OBJECT,
        /*properties: {
            corrected_name: { type: Type.STRING, description: "The spell-corrected name of the entity." },
            entity_type: {
                type: Type.STRING,
                enum: ["chemical", "gene"],
                description: "The determined type of the entity."
            },
            synonyms: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of common synonyms." },
            resolved_name: { type: Type.STRING, description: "The most common or official name for the entity." },
            confidence: { type: Type.NUMBER, description: "Confidence score (0.0 to 1.0) for this resolution." },
            resolution_category: { 
                type: Type.STRING, 
                enum: ["Exact Match", "Synonym", "Abbreviation", "Corrected Spelling", "Inferred", "Ambiguous", "Failed"],
                description: "The nature of the mapping between input and resolved name."
            },
            error_taxonomy: {
                type: Type.STRING,
                enum: ["None", "Misspelling", "Synonym", "Abbreviation", "Obsolete Name", "Casing/Punctuation", "Greek Letter Conversion", "Species-Specific", "Multiple Hits", "Other"],
                description: "The type of discrepancy identified between input and canonical entry."
            },
            candidates: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        id: { type: Type.STRING },
                        source: { type: Type.STRING },
                        confidence: { type: Type.NUMBER },
                        description: { type: Type.STRING, nullable: true }
                    },
                    required: ["name", "id", "source", "confidence"]
                },
                description: "Other possible candidates if the input is ambiguous. Each should include a confidence score."
            },
            validation_issues: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of issues if entity cannot be found or identified." },
            pathways: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of biological pathways this entity is involved in." },
            biological_function: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of biological functions of this entity." },
            cellular_component: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of cellular components where this entity is found." },
            identifiers: {
                type: Type.OBJECT,
                properties: {
                    "PubChem CID": { type: Type.STRING, nullable: true },
                    "ChEMBL ID": { type: Type.STRING, nullable: true },
                    "KEGG": { type: Type.STRING, nullable: true },
                    "UniProt": { type: Type.STRING, nullable: true },
                    "RefSeq": { type: Type.STRING, nullable: true },
                    "Ensembl": { type: Type.STRING, nullable: true },
                    "InterPro": { type: Type.STRING, nullable: true },
                    "InChIKey": { type: Type.STRING, nullable: true },
                    "SMILES": { type: Type.STRING, nullable: true },
                },
            },
            links: {
                type: Type.OBJECT,
                properties: {
                    "PubChem Link": { type: Type.STRING, nullable: true },
                    "ChEMBL Link": { type: Type.STRING, nullable: true },
                    "KEGG Link": { type: Type.STRING, nullable: true },
                    "UniProt Link": { type: Type.STRING, nullable: true },
                },
            },
            is_ambiguous: {
                type: Type.BOOLEAN,
                description: "Set to true if the entity name is ambiguous and maps to multiple isoforms, genes, or distinct chemical structures. Otherwise set to false."
            },
            alternative_suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of up to three potential alternative matches or suggestions when the name is ambiguous and maps to multiple targets."
            }
        },*/
        properties: {
            normalized_name: { type: Type.STRING, description: "The normalized name of the entity" },
            entity_type: {
                type: Type.STRING,
                enum: ["chemical", "gene"],
                description: "The determined type of the entity."
            },
            status: {
                type: Type.STRING,
                enum: ["resolved", "abstain"],
                description: "The resolution status of the LLM. If the entity could not be resolved, it will abstain."
            },
        },
        required: ["normalized_name", "entity_type", "status"]
    };

    // Arm A extra fields
    if (EXPERIMENT_ARM === "A") {
        const { status, ...rest } = schema.properties;
        schema.properties = { ...rest, identifier: { type: Type.STRING }, status } as any;
        schema.required = ["normalized_name", "entity_type", "identifier", "status"];
    }

    return schema;
};

const callGeminiApi = async (
    prompt: string, 
    apiKey: string | undefined, 
    ontology: OntologyType,
    strictDeterminism: boolean = true,
    temperature: number = 0,
    topP: number = 0
): Promise<GeminiApiResponse> => {
     try {
        const ai = getGeminiClient(apiKey);
        const config: any = {
            responseMimeType: "application/json",
            responseSchema: getResponseSchema(ontology),
        };

        if (strictDeterminism) {
            config.temperature = 0;
            config.topP = 0;
        } else {
            config.temperature = temperature;
            config.topP = topP;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: config,
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as GeminiApiResponse;
    } catch (error) {
        console.error("Error calling Gemini API:", error);
        throw new Error(`Failed to get data from Gemini. Check console for details. Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
}

// --- Generic API Service ---

const createPrompt = (
    originalName: string,
    entityTypeHint: string,
    backgroundInfo: string,
    ontology: OntologyType,
    isDeepSearch: boolean
): string => {
    const ontologyInstruction = ontology !== 'None'
        ? `Additionally, find its corresponding term and ID from the ${ontology} database.`
        : '';


    if (isDeepSearch) {
        return `
        You are an expert research assistant performing a deep, exhaustive search for a biological or chemical entity. A previous quick search failed to find it. You must now try harder, using alternative search strategies.

        You MUST respond ONLY with a valid JSON object that conforms to the provided schema.

        Entity Name to Analyze: "${originalName}"
        Additional Background Context: "${backgroundInfo || 'None provided.'}"

        Perform the following actions with maximum effort:
        1. Correct any spelling errors in the entity name.
        2. Categorize the resolution ("resolution_category"):
           - "Exact Match": Input is the canonical name.
           - "Synonym": Input is a standard synonym.
           - "Abbreviation": Input is a common abbreviation (e.g., "ATP").
           - "Corrected Spelling": Minor character fixes were applied.
           - "Inferred": Name was inferred from context.
           - "Ambiguous": Multiple hits, best choice selected.
        3. Identify the error type ("error_taxonomy"):
           - "None": No error.
           - "Misspelling": Spelling correction was needed.
           - "Synonym": Synonym resolution was needed.
           - "Abbreviation": Abbreviation expansion was needed.
           - "Obsolete Name": Name is outdated.
           - "Casing/Punctuation": Only minor case/symbol changes.
           - "Greek Letter Conversion": e.g., "alpha" to "a".
           - "Species-Specific": Name refers to a specific species.
           - "Multiple Hits": Ambiguous name with multiple candidates.
        4. Determine the entity's type, which MUST be either 'chemical' or 'gene'. Prioritize the user's hint but correct it if it's clearly wrong.
        5. Provide a confidence score (0.0 to 1.0) based on how certain you are of this resolution for the primary 'resolved_name'.
        6. If the name is ambiguous (e.g., 'PLD alpha' which could be various genes), list ALL plausible candidates in the 'candidates' array, ordered by confidence. Include the primary resolved candidate here as well if it belongs in the list.
        7. If an entity name maps to multiple isoforms, genes, or distinct chemical structures, set 'is_ambiguous' to true and list up to three potential matches in 'alternative_suggestions' instead of choosing one arbitrarily. Otherwise, set 'is_ambiguous' to false and keep 'alternative_suggestions' as an empty array [].
        8. Find common synonyms for the corrected name.
        9. Search across a WIDE range of databases. Do not give up easily.
        10. Find its biological pathways (e.g., "Glycolysis").
        11. Describe its biological function (e.g., "Enzyme catalysis").
        12. Identify its cellular component/location (e.g., "Mitochondrion").
        13. ${ontologyInstruction}
        14. Retrieve any standard identifiers and direct links you can find, even if it's just one.
        15. If, after an exhaustive search, you still cannot find anything, populate 'validation_issues' with "Exhaustive search failed to find a match". Otherwise, provide as much information as you discovered.
        16. Ensure all identifiers are cross-referenced and validated against multiple sources where possible.

        Return your findings in the specified JSON format.
        `;
    }
    /*return `
    You are an expert chemist and biologist acting as a data aggregation service. Your task is to analyze a given entity name, correct it, and find its identifiers, pathways, function, and cellular location from scientific databases.

    You MUST respond ONLY with a valid JSON object that conforms to the provided schema. Do not include any explanatory text, markdown formatting, or anything outside the JSON object.

    Entity Name to Analyze: "${originalName}"
    ${typeHintLine}
    Additional Background Context: "${backgroundInfo || 'None provided.'}"

    Based on the entity name and context, perform the following actions:
    1. Correct any spelling errors in the entity name.
    2. Categorize the resolution ("resolution_category") using the following definitions: "Exact Match", "Synonym", "Abbreviation", "Corrected Spelling", "Inferred", "Ambiguous".
    3. Identify the error type ("error_taxonomy") from: "None", "Misspelling", "Synonym", "Abbreviation", "Obsolete Name", "Casing/Punctuation", "Greek Letter Conversion", "Species-Specific", "Multiple Hits".
    4. Determine the entity's type, which MUST be either 'chemical' or 'gene'.
    5. Provide a confidence score (0.0 to 1.0) based on how certain you are of this resolution for the primary 'resolved_name'.
    6. If the name is ambiguous, list ALL plausible candidates in the 'candidates' array, ordered by confidence.
    7. If an entity name maps to multiple isoforms, genes, or distinct chemical structures, set 'is_ambiguous' to true and list up to three potential matches in 'alternative_suggestions' instead of choosing one arbitrarily. Otherwise, set 'is_ambiguous' to false and keep 'alternative_suggestions' as an empty array [].
    8. Find common synonyms for the corrected name.
    9. Search relevant databases (PubChem, ChEMBL, KEGG, UniProt, Gene Ontology, etc.).
    10. Retrieve standard identifiers and direct links.
    11. Find its biological pathways (e.g., "Glycolysis", "MAPK signaling pathway").
    12. Describe its biological function (e.g., "Enzyme catalysis", "Transcription factor").
    13. Identify its cellular component/location (e.g., "Mitochondrion", "Nucleus", "Cytoplasm").
    14. ${ontologyInstruction}
    15. If you cannot find the entity, populate 'validation_issues' with a descriptive message like "No definitive IDs found in any database". Otherwise, leave it as an empty array and fill the other fields.
    16. Ensure all data is sourced from high-quality, peer-reviewed databases and cross-validated.

    Return your findings in the specified JSON format.
    `;*/
    if (EXPERIMENT_ARM === "A") {
        return `
    Your task is biomedical entity normalization. You will receive an input that may be misspelled, abbreviated or contain other sorts of noise of a chemical compound or human gene. You MUST return the normalized name of the entity: for chemicals the standard compound name, for genes the HGNC approved symbol. If you cannot identify the input, set normalized_name to "" and status to "abstain". Additionally, return its identifier: for genes the HGNC ID (format HGNC:[number]), for chemicals the PubChem CID (an integer).

    Respond ONLY in the following JSON format:
    {"normalized_name": string, "entity_type": "chemical" | "gene", "identifier": string, "status": "resolved" | "abstain"}
    Input: "${originalName}"

    `
    }
    return `
    Your task is biomedical entity normalization. You will receive an input that may be misspelled, abbreviated or contain other sorts of noise of a chemical compound or human gene. You MUST return the normalized name of the entity: for chemicals the standard compound name, for genes the HGNC approved symbol. If you cannot identify the input, set normalized_name to "" and status to "abstain".

    Respond ONLY in the following JSON format:
    {"normalized_name": string, "entity_type": "chemical" | "gene", "status": "resolved" | "abstain"}
    Input: "${originalName}"

    `
};

const LOCAL_OLLAMA_MODELS = new Set(["gemma4:e2b", "gemma4:e4b", "phi4-mini:3.8b", "qwen3.5:4b"]);

// Ollama's structured outputs want a plain JSON Schema (lowercase "type" strings),
// while getResponseSchema() returns Gemini's dialect (Type.OBJECT, Type.STRING, ...).
// Both use the same field names, so just lowercase the enum values recursively.
const toJsonSchema = (node: any): any =>
    Array.isArray(node) ? node.map(toJsonSchema)
    : node && typeof node === "object" ? Object.fromEntries(
        Object.entries(node).map(([k, v]) => [k, k === "type" ? String(v).toLowerCase() : toJsonSchema(v)])
      )
    : node;

const parseMaybeJson = (value: string) => {
    const trimmed = value.trim();
    const cleaned = trimmed.replace(/^```json\s*|\s*```$/g, "");
    return JSON.parse(cleaned);
};

// Providers without schema enforcement (OpenAI, Groq, Anthropic) can omit fields.
// A response with missing fields counts as an abstention rather than falling back to the input name.
const normalizeApiResponse = (raw: any): GeminiApiResponse => ({
    normalized_name: raw?.normalized_name ?? "",
    entity_type: raw?.entity_type ?? "",
    status: raw?.status ?? "abstain",
    identifier: raw?.identifier,
});


export const fetchEntityInfo = async (
    provider: ApiProvider,
    apiKey: string,
    originalName: string,
    entityTypeHint: string,
    backgroundInfo: string,
    ontology: OntologyType,
    isDeepSearch: boolean
): Promise<GeminiApiResponse> => {
    const prompt = createPrompt(originalName, entityTypeHint, backgroundInfo, ontology, isDeepSearch);

    if (LOCAL_OLLAMA_MODELS.has(provider)) {
        const response = await fetch("http://127.0.0.1:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: provider,
                stream: false,
                format: toJsonSchema(getResponseSchema(ontology)),
                options: { temperature: 0, seed: 100, num_ctx: 4096, num_gpu: 0, num_thread: 10 }, // The option parameters are hard coded for test runs. GPU IS TURNED OFF FOR THIS
                messages: [{ role: "user", content: prompt }],
                think: false,
                keep_alive: "30m"
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ollama request failed: ${errorText || response.status}`);
        }

        const data = await response.json();

        const parsed = parseMaybeJson(data?.message?.content || data?.response || "{}");
        const { prompt_eval_count, prompt_eval_duration, eval_count, eval_duration, total_duration, load_duration } = data;
        return {
            ...normalizeApiResponse(parsed),
            prompt_eval_count, prompt_eval_duration, eval_count, eval_duration, total_duration, load_duration, message: JSON.stringify(data.message),
        };
    }

    // Call backend proxy for all providers (including Gemini) to shield keys and secure requests
    try {
        const response = await fetch("/api/ai/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                apiKey,
                prompt,
                responseSchema: getResponseSchema(ontology)
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        const parsed = await response.json();
        // Only the Gemini proxy sends these out
        const { prompt_eval_count, eval_count, total_duration, message } = parsed;
        return { ...normalizeApiResponse(parsed), prompt_eval_count, eval_count, total_duration, message };
    } catch (error) {
        console.error(`Error calling ${provider} via proxy:`, error);
        throw error;
    }
};
