import { EntityResult } from '../types';

export const generateAndDownloadCsv = (data: EntityResult[], filename: string): void => {
  if (data.length === 0) {
    console.warn("No data to generate CSV.");
    return;
  }

  const headers: (keyof EntityResult)[] = [
    // Experiment columns
    "Arm", "Input Entity", "Resolved Name", "Entity Type", "Identifier", "Status",
    "Processing Time (s)", "Validation Issues",
    "prompt_eval_count", "prompt_eval_duration", "eval_count", "eval_duration", "total_duration", "load_duration", "message",
    // Legacy ECO-ID columns (can be added back later)
    "Refined Entity Name", "Confidence Score", "Resolution Category", "Error Taxonomy",
    "Verification Status", "Verification Method", "Candidates",
    "Pathways", "Function", "Cellular Component",
    "Ontology ID", "Ontology Term",
    "PubChem CID", "ChEMBL ID", "KEGG", "UniProt", "RefSeq", "Ensembl", "InterPro",
    "InChIKey", "SMILES",
    "PubChem Link", "ChEMBL Link", "KEGG Link", "UniProt Link"
  ];

  const csvRows: string[] = [];
  csvRows.push(headers.join(','));

  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] ?? ''; // Use nullish coalescing for undefined/null
      const escaped = ('' + value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }

  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
