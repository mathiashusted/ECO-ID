
export interface VerificationResult {
  verified: boolean;
  method: string;
  details?: string;
  status: "Verified" | "Unverified" | "Failed";
}

/**
 * Verifies a UniProt ID against the UniProt REST API.
 */
export const verifyUniProtId = async (id: string): Promise<VerificationResult> => {
  if (!id) return { verified: false, status: "Unverified", method: "UniProt API" };
  
  try {
    const response = await fetch(`https://rest.uniprot.org/uniprotkb/${id}.json`);
    if (response.ok) {
      const data = await response.json();
      const primaryName = data.proteinDescription?.recommendedName?.fullName?.value || id;
      return { 
        verified: true, 
        status: "Verified", 
        method: "UniProt API", 
        details: `Confirmed: ${primaryName}` 
      };
    }
    return { verified: false, status: "Failed", method: "UniProt API", details: "ID not found in UniProt" };
  } catch (error) {
    console.error("UniProt Verification Error:", error);
    return { verified: false, status: "Unverified", method: "UniProt API", details: "Network Error" };
  }
};

/**
 * Verifies a PubChem CID against the PubChem PUG REST API.
 */
export const verifyPubChemId = async (cid: string | number): Promise<VerificationResult> => {
  if (!cid) return { verified: false, status: "Unverified", method: "PubChem API" };

  try {
    const response = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title/JSON`);
    if (response.ok) {
      const data = await response.json();
      const title = data.PropertyTable?.Properties?.[0]?.Title || "Unknown Compound";
      return { 
        verified: true, 
        status: "Verified", 
        method: "PubChem API", 
        details: `Confirmed: ${title}` 
      };
    }
    return { verified: false, status: "Failed", method: "PubChem API", details: "CID not found in PubChem" };
  } catch (error) {
    console.error("PubChem Verification Error:", error);
    return { verified: false, status: "Unverified", method: "PubChem API", details: "Network Error" };
  }
};

/**
 * Orchestrates verification for any given entity based on available IDs.
 */
export const verifyEntity = async (identifiers: any, entityType: string): Promise<VerificationResult> => {
  if (entityType === 'protein' || entityType === 'gene') {
    if (identifiers["UniProt"]) {
      return await verifyUniProtId(identifiers["UniProt"]);
    }
  }

  if (entityType === 'chemical') {
    if (identifiers["PubChem CID"]) {
      return await verifyPubChemId(identifiers["PubChem CID"]);
    }
  }

  return { verified: false, status: "Unverified", method: "None", details: "No verifiable IDs provided" };
};
