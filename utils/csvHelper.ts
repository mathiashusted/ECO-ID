import { EntityResult } from '../types';

export const generateAndDownloadCsv = (data: EntityResult[], filename: string): void => {
  if (data.length === 0) {
    console.warn("No data to generate CSV.");
    return;
  }

  const headers: (keyof EntityResult)[] = [
    "Input Entity", "Refined Entity Name", "Entity Type", "Resolved Name", 
    "Confidence Score", "Resolution Category", "Error Taxonomy", "Verification Status", "Verification Method",
    "Candidates", "Validation Issues",
    "Pathways", "Function", "Cellular Component",
    "Ontology ID", "Ontology Term",
    "PubChem CID", "ChEMBL ID", "KEGG", "UniProt", "RefSeq", "Ensembl", "InterPro",
    "InChIKey", "SMILES",
    "PubChem Link", "ChEMBL Link", "KEGG Link", "UniProt Link",
    "Processing Time (s)"
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
