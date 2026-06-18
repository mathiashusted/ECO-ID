import { GoogleGenAI, Type } from "@google/genai";
import { GeminiApiResponse, ApiProvider, OntologyType } from "../types";

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
        properties: {
            corrected_name: { type: Type.STRING, description: "The spell-corrected name of the entity." },
            entity_type: { type: Type.STRING, description: "The determined type: 'chemical', 'protein', 'gene', or 'unknown'." },
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
        },
        required: ["corrected_name", "entity_type", "synonyms", "resolved_name", "confidence", "resolution_category", "error_taxonomy", "is_ambiguous", "alternative_suggestions", "validation_issues", "pathways", "biological_function", "cellular_component", "identifiers", "links"]
    };

    if (ontology !== 'None') {
        schema.properties['ontology_id'] = { type: Type.STRING, nullable: true, description: `The primary ID from the ${ontology} database (e.g., GO:0008150, CHEBI:16236).` };
        schema.properties['ontology_term'] = { type: Type.STRING, nullable: true, description: `The corresponding term name from ${ontology}.` };
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
        User Provided Type Hint: "${entityTypeHint}"
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
        4. Determine the entity's type (e.g., 'chemical', 'protein', 'gene'). Prioritize the user's hint but correct it if it's clearly wrong.
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
    return `
    You are an expert chemist and biologist acting as a data aggregation service. Your task is to analyze a given entity name, correct it, and find its identifiers, pathways, function, and cellular location from scientific databases.

    You MUST respond ONLY with a valid JSON object that conforms to the provided schema. Do not include any explanatory text, markdown formatting, or anything outside the JSON object.

    Entity Name to Analyze: "${originalName}"
    User Provided Type Hint: "${entityTypeHint}"
    Additional Background Context: "${backgroundInfo || 'None provided.'}"

    Based on the entity name and context, perform the following actions:
    1. Correct any spelling errors in the entity name.
    2. Categorize the resolution ("resolution_category") using the following definitions: "Exact Match", "Synonym", "Abbreviation", "Corrected Spelling", "Inferred", "Ambiguous".
    3. Identify the error type ("error_taxonomy") from: "None", "Misspelling", "Synonym", "Abbreviation", "Obsolete Name", "Casing/Punctuation", "Greek Letter Conversion", "Species-Specific", "Multiple Hits".
    4. Determine the entity's type (e.g., 'chemical', 'protein', 'gene').
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
    `;
};


export const fetchEntityInfo = async (
    provider: ApiProvider,
    apiKey: string,
    originalName: string,
    entityTypeHint: string,
    backgroundInfo: string,
    ontology: OntologyType,
    isDeepSearch: boolean,
    strictDeterminism: boolean = true,
    temperature: number = 0,
    topP: number = 0
): Promise<GeminiApiResponse> => {
    const prompt = createPrompt(originalName, entityTypeHint, backgroundInfo, ontology, isDeepSearch);

    // Call backend proxy for all providers (including Gemini) to shield keys and secure requests
    try {
        const response = await fetch("/api/ai/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                apiKey,
                prompt,
                responseSchema: getResponseSchema(ontology),
                strictDeterminism,
                temperature,
                topP
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }

        return await response.json() as GeminiApiResponse;
    } catch (error) {
        console.error(`Error calling ${provider} via proxy:`, error);
        throw error;
    }
};
