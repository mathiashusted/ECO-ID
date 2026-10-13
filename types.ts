
export type EntityType = "Auto" | "Chemical" | "Protein" | "Gene";
export type OntologyType = "None" | "Gene Ontology" | "ChEBI" | "MeSH";

export type ApiProvider = 
  | "Google Gemini" 
  | "OpenAI" 
  | "Groq" 
  | "Anthropic" 
  | "Cohere" 
  | "Mistral AI"
  | "Perplexity"
  | "Together AI"
  | "gemma4:e2b"
  | "gemma4:e4b"
  | "phi4-mini:3.8b"
  | "hf.co/unsloth/Qwen3.5-9B-GGUF:Q4_K_S";

// Raw Ollama response metrics (durations in nanosecs)
export interface OllamaStats {
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
  load_duration?: number;
  message?: string;
}

export interface EntityResult extends OllamaStats {
  "Input Entity": string;
  "Refined Entity Name": string;
  "Entity Type": string;
  "Resolved Name": string;
  "Status"?: string;
  "Identifier"?: string;
  "Arm"?: string;
  "Confidence Score": number;
  "Resolution Category": "Exact Match" | "Synonym" | "Abbreviation" | "Corrected Spelling" | "Inferred" | "Ambiguous" | "Failed" | "Normalized Name";
  "Error Taxonomy"?: string;
  "Verification Status": "Verified" | "Unverified" | "Failed";
  "Verification Method"?: string;
  "Validation Issues": string;
  "Candidates"?: string;
  "Is Ambiguous"?: boolean;
  "Alternative Suggestions"?: string;
  "Pathways"?: string;
  "Function"?: string;
  "Cellular Component"?: string;
  "Ontology ID"?: string;
  "Ontology Term"?: string;
  "PubChem CID"?: string;
  "ChEMBL ID"?: string;
  "KEGG"?: string;
  "UniProt"?: string;
  "RefSeq"?: string;
  "Ensembl"?: string;
  "InterPro"?: string;
  "InChIKey"?: string;
  "SMILES"?: string;
  "PubChem Link"?: string;
  "ChEMBL Link"?: string;
  "KEGG Link"?: string;
  "UniProt Link"?: string;
  "Processing Time (s)"?: number;
}

export interface GeminiApiResponse extends OllamaStats {
  normalized_name: string;
  entity_type: 'chemical' | 'gene' | '';
  status: 'resolved' | 'abstain';
  identifier?: string; // Only for arm A
}

export interface SessionState {
  entityList: string[];
  entityType: EntityType;
  backgroundInfo: string;
  ontology: OntologyType;
  results: EntityResult[];
  logs: string[];
  analysisPhase: string;
  apiProvider: ApiProvider;
  textAreaContent: string;
  fileName: string;
  multiCandidateMode: boolean;
  aiMode?: "cloud" | "local";
  strictDeterminism?: boolean;
  temperature?: number;
  topP?: number;
}
