import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Play, 
  Square, 
  Search, 
  HelpCircle, 
  Settings, 
  X, 
  Save, 
  RotateCcw, 
  FileText, 
  BarChart3, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Download,
  Info,
  Database,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Users
} from 'lucide-react';
import { EntityType, EntityResult, ApiProvider, OntologyType, SessionState } from './types';
import { fetchEntityInfo } from './services/geminiService';
import { generateAndDownloadCsv } from './utils/csvHelper';
import { verifyEntity } from './services/verificationService';
import { DEMO_ENTITIES_DATA } from './data/demoData';

type AnalysisPhase = 'idle' | 'initial' | 'deep_search_pending' | 'deep_searching' | 'complete';
type AppTab = 'setup' | 'execution' | 'results';

// --- UI Components ---

const ResultsTable: React.FC<{ results: EntityResult[] }> = ({ results }) => {
    if (results.length === 0) return null;
    const headers = ["Input", "Resolved", "Match Type", "Confidence", "Verification", "Type", "ID & Links", "Status"];
    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-slate-800 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-indigo-600" />
                    Detailed Results
                </h3>
                <span className="text-sm text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
                    {results.length} Entities Processed
                </span>
            </div>
            <div className="overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                            <tr>
                                {headers.map(header => (
                                    <th key={header} scope="col" className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
                            {results.map((result, index) => {
                                const primaryId = result["UniProt"] || result["PubChem CID"] || result["Ontology ID"] || '—';
                                const primaryLink = result["UniProt Link"] || result["PubChem Link"] || result["KEGG Link"] || result["ChEMBL Link"];
                                const confidence = result["Confidence Score"] || 0;
                                const verStatus = result["Verification Status"];
                                
                                return (
                                    <tr key={`${result["Input Entity"]}-${index}`} className="hover:bg-slate-50 transition-colors duration-150">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                                            <div>
                                                {result["Input Entity"]}
                                                {result["Candidates"] && (
                                                    <div className="flex items-center mt-1 text-[10px] text-indigo-500 font-bold uppercase tracking-tighter">
                                                        <Users className="h-2 w-2 mr-1" />
                                                        Ambiguous Name
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                            <div className="font-medium text-slate-900">{result["Resolved Name"] || '—'}</div>
                                            {result["Is Ambiguous"] && (
                                                <div className="mt-1 flex flex-col space-y-1">
                                                    <span className="inline-flex items-center text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-semibold w-fit">
                                                        Ambiguous Target
                                                    </span>
                                                    {result["Alternative Suggestions"] && (
                                                        <div className="text-[10px] text-slate-500 font-medium max-w-[180px] leading-tight" title={result["Alternative Suggestions"]}>
                                                            Sugg: {result["Alternative Suggestions"]}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {!result["Is Ambiguous"] && result["Candidates"] && (
                                                <div className="text-[10px] text-slate-400 truncate max-w-[150px]" title={result["Candidates"]}>
                                                    Alt: {result["Candidates"]}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="flex flex-col">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    result["Resolution Category"] === 'Exact Match' ? 'bg-emerald-100 text-emerald-700' :
                                                    result["Resolution Category"] === 'Ambiguous' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-indigo-100 text-indigo-700'
                                                }`}>
                                                    {result["Resolution Category"]}
                                                </span>
                                                {result["Error Taxonomy"] && result["Error Taxonomy"] !== 'None' && (
                                                    <span className="text-[9px] text-slate-400 mt-1 italic font-medium leading-none">
                                                        Tax: {result["Error Taxonomy"]}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div className="flex items-center space-x-2">
                                                <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                    <div className={`h-full rounded-full ${confidence > 0.8 ? 'bg-emerald-500' : confidence > 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${confidence * 100}%` }}></div>
                                                </div>
                                                <span className="font-mono font-bold text-slate-500 text-[10px]">{(confidence * 100).toFixed(0)}%</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            {verStatus === 'Verified' ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100" title={result["Verification Method"]}>
                                                    <ShieldCheck className="h-3 w-3 mr-1" /> Verified
                                                </span>
                                            ) : verStatus === 'Failed' ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] bg-rose-50 text-rose-700 border border-rose-100" title={result["Verification Method"]}>
                                                    <ShieldAlert className="h-3 w-3 mr-1" /> Hallucination?
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] bg-slate-50 text-slate-500 border border-slate-100">
                                                    <ShieldQuestion className="h-3 w-3 mr-1" /> Unverified
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                                                result["Entity Type"] === 'chemical' ? 'bg-emerald-100 text-emerald-700' :
                                                result["Entity Type"] === 'protein' ? 'bg-blue-100 text-blue-700' :
                                                result["Entity Type"] === 'gene' ? 'bg-purple-100 text-purple-700' :
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                                {result["Entity Type"] || 'Unknown'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {primaryLink ? (
                                                <a 
                                                    href={primaryLink} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-mono font-medium hover:underline"
                                                >
                                                    {primaryId}
                                                    <Download className="h-3 w-3 ml-1 rotate-[-90deg]" />
                                                </a>
                                            ) : (
                                                <span className="font-mono text-slate-400">{primaryId}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono text-xs">{result["Processing Time (s)"]?.toFixed(2) ?? '—'}s</td>
                                        <td className="px-6 py-4 text-sm">
                                            {result["Validation Issues"] ? (
                                                <div className="flex items-center text-amber-600">
                                                    <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                                                    <span className="truncate max-w-[150px]">{result["Validation Issues"]}</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center text-emerald-600">
                                                    <CheckCircle2 className="h-4 w-4 mr-1 flex-shrink-0" />
                                                    <span>Resolved</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const VisualizationDashboard: React.FC<{ results: EntityResult[] }> = ({ results }) => {
    const typeChartRef = useRef<HTMLDivElement>(null);
    const verifChartRef = useRef<HTMLDivElement>(null);
    const auditChartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (results.length > 0 && typeChartRef.current && verifChartRef.current && auditChartRef.current) {
            // Type Distribution
            const typeCounts = results.reduce((acc, result) => {
                const type = (result["Entity Type"] || 'Unknown').toLowerCase();
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {} as { [key: string]: number });

            const typeData = [{
                values: Object.values(typeCounts),
                labels: Object.keys(typeCounts).map(l => l.charAt(0).toUpperCase() + l.slice(1)),
                type: 'pie',
                hole: .4,
                hoverinfo: 'label+percent',
                textinfo: 'value',
                automargin: true,
                marker: {
                    colors: ['#10b981', '#3b82f6', '#8b5cf6', '#64748b', '#f59e0b']
                }
            }];

            // Resolution Category
            const auditCounts = results.reduce((acc, result) => {
                const cat = result["Resolution Category"] || 'Uncategorized';
                acc[cat] = (acc[cat] || 0) + 1;
                return acc;
            }, {} as { [key: string]: number });

            const auditData = [{
                values: Object.values(auditCounts),
                labels: Object.keys(auditCounts),
                type: 'pie',
                hole: .4,
                hoverinfo: 'label+percent',
                textinfo: 'value',
                automargin: true,
                marker: {
                    colors: ['#047857', '#0891b2', '#4338ca', '#7c3aed', '#db2777', '#d97706', '#dc2626']
                }
            }];

            // Verification Status
            const verifCounts = results.reduce((acc, result) => {
                const status = result["Verification Status"] || 'Unverified';
                acc[status] = (acc[status] || 0) + 1;
                return acc;
            }, {} as { [key: string]: number });

            const verifData = [{
                values: Object.values(verifCounts),
                labels: Object.keys(verifCounts),
                type: 'pie',
                hole: .4,
                hoverinfo: 'label+percent',
                textinfo: 'value',
                automargin: true,
                marker: {
                    colors: ['#059669', '#94a3b8', '#e11d48']
                }
            }];

            const layout = {
                showlegend: true,
                height: 300,
                margin: { t: 30, b: 30, l: 30, r: 30 },
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { family: 'Inter, sans-serif', size: 10 }
            };

            (window as any).Plotly.newPlot(typeChartRef.current, typeData, { ...layout, title: { text: 'Entity Types', font: { weight: 600 } } }, {responsive: true, displayModeBar: false});
            (window as any).Plotly.newPlot(auditChartRef.current, auditData, { ...layout, title: { text: 'Match Resolution Taxonomy', font: { weight: 600 } } }, {responsive: true, displayModeBar: false});
            (window as any).Plotly.newPlot(verifChartRef.current, verifData, { ...layout, title: { text: 'Verification Audit', font: { weight: 600 } } }, {responsive: true, displayModeBar: false});
        }
    }, [results]);

    if (results.length === 0) return null;

    return (
        <div className="mt-8">
             <h3 className="text-xl font-semibold text-slate-800 mb-4 flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-indigo-600" />
                Resolution Data Quality Audit
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <div ref={typeChartRef} className="w-full"></div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <div ref={auditChartRef} className="w-full"></div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <div ref={verifChartRef} className="w-full"></div>
                </div>
             </div>
        </div>
    );
};


const HelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
    <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4" 
        onClick={onClose}
    >
        <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" 
            onClick={e => e.stopPropagation()}
        >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center">
                    <HelpCircle className="h-6 w-6 mr-2 text-indigo-600" />
                    User Documentation
                </h2>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="h-6 w-6" />
                </button>
            </div>
            <div className="p-8 overflow-y-auto space-y-8">
                <section>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center">
                        <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm mr-3">1</span>
                        Configuration & Setup
                    </h3>
                    <div className="pl-11 space-y-3 text-slate-600 leading-relaxed">
                        <p><strong className="text-slate-800">API Integration:</strong> Connect your preferred AI model. For Google Gemini, the system uses the environment key by default if left blank.</p>
                        <p><strong className="text-slate-800">Ontology Mapping:</strong> Select specialized databases like ChEBI or Gene Ontology to enrich the resolution process with domain-specific IDs.</p>
                        <p><strong className="text-slate-800">Multi-Candidate Resolution:</strong> Enable this to see alternative high-confidence hits for ambiguous names like "PLD alpha". Alternatives will be displayed as separate rows in your report.</p>
                        <p><strong className="text-slate-800">Data Ingestion:</strong> Upload a plain text file or paste entities directly into the editor.</p>
                    </div>
                </section>

                <section>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center">
                        <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm mr-3">2</span>
                        Analysis Execution
                    </h3>
                    <div className="pl-11 space-y-3 text-slate-600 leading-relaxed">
                        <p><strong className="text-slate-800">Real-time Monitoring:</strong> Watch the processing queue in the Execution tab. The system provides live logs and a progress indicator.</p>
                        <p><strong className="text-slate-800">Deep Search:</strong> For ambiguous or obscure entities, use the Deep Search feature which employs advanced reasoning to scour multiple databases.</p>
                    </div>
                </section>

                <section>
                    <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center">
                        <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm mr-3">3</span>
                        Results & Export
                    </h3>
                    <div className="pl-11 space-y-3 text-slate-600 leading-relaxed">
                        <p><strong className="text-slate-800">Visualization:</strong> Analyze the distribution of your entity types through interactive charts.</p>
                        <p><strong className="text-slate-800">CSV Export:</strong> The system automatically generates a comprehensive CSV report including all identifiers and links upon completion.</p>
                    </div>
                </section>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button onClick={onClose} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                    Got it, thanks!
                </button>
            </div>
        </motion.div>
    </motion.div>
);

const ApiKeyStatus: React.FC<{ provider: ApiProvider; apiKey: string }> = ({ provider, apiKey }) => {
    if (apiKey) return <span className="px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full flex items-center"><CheckCircle2 className="h-3 w-3 mr-1" /> User Key Active</span>;
    if (provider === 'Google Gemini') return <span className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-full flex items-center"><Database className="h-3 w-3 mr-1" /> Environment Default</span>;
    return <span className="px-3 py-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full flex items-center"><AlertCircle className="h-3 w-3 mr-1" /> Key Required</span>;
};

const SESSION_STORAGE_KEY = 'ecoIdSession';

const App: React.FC = () => {
    // State management
    const [entityList, setEntityList] = useState<string[]>([]);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [entityType, setEntityType] = useState<EntityType>("Auto");
    const [backgroundInfo, setBackgroundInfo] = useState('');
    const [ontology, setOntology] = useState<OntologyType>("None");
    const [logs, setLogs] = useState<string[]>(["System initialized. Awaiting data configuration..."]);
    const [progress, setProgress] = useState(0);
    const [totalForProgress, setTotalForProgress] = useState(0);
    const [results, setResults] = useState<EntityResult[]>([]);
    const [fileName, setFileName] = useState<string>('');
    const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle');
    const [textAreaContent, setTextAreaContent] = useState('');
    const [apiProvider, setApiProvider] = useState<ApiProvider>('Google Gemini');
    const [apiKey, setApiKey] = useState('');
    const [multiCandidateMode, setMultiCandidateMode] = useState(false);
    const [strictDeterminism, setStrictDeterminism] = useState(true);
    const [temperature, setTemperature] = useState(0);
    const [topP, setTopP] = useState(0);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<AppTab>('setup');
    const [keyAlert, setKeyAlert] = useState<string | null>(null);

    const runningRef = useRef(false);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const apiProviders: ApiProvider[] = ["Google Gemini", "OpenAI", "Groq", "Anthropic", "Cohere", "Mistral AI", "Perplexity", "Together AI"];
    const ontologies: OntologyType[] = ["None", "Gene Ontology", "ChEBI", "MeSH"];

    // Effects
    useEffect(() => {
        if (logContainerRef.current) logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }, [logs]);

    // Callbacks and handlers
    const addLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    }, []);
    
    const handleSaveSession = () => {
        try {
            const sessionState: SessionState = {
                entityList, entityType, backgroundInfo, ontology, results, logs,
                analysisPhase, apiProvider, textAreaContent, fileName, multiCandidateMode,
                strictDeterminism, temperature, topP
            };
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionState));
            addLog("Session state persisted to local storage.");
        } catch (error) {
            addLog("Persistence failed. Storage might be restricted.");
            console.error("Failed to save session:", error);
        }
    };
    
    const handleLoadSession = () => {
        try {
            const savedStateJSON = localStorage.getItem(SESSION_STORAGE_KEY);
            if (savedStateJSON) {
                const savedState: SessionState = JSON.parse(savedStateJSON);
                setEntityList(savedState.entityList);
                setEntityType(savedState.entityType);
                setBackgroundInfo(savedState.backgroundInfo);
                setOntology(savedState.ontology);
                setResults(savedState.results);
                setLogs(savedState.logs);
                setAnalysisPhase(savedState.analysisPhase as AnalysisPhase);
                setApiProvider(savedState.apiProvider);
                setTextAreaContent(savedState.textAreaContent);
                setFileName(savedState.fileName);
                setMultiCandidateMode(savedState.multiCandidateMode || false);
                setStrictDeterminism(savedState.strictDeterminism !== false);
                setTemperature(savedState.temperature ?? 0);
                setTopP(savedState.topP ?? 0);
                addLog("Previous session restored successfully.");
            } else {
                addLog("No existing session found.");
            }
        } catch (error) {
            addLog("Restoration failed. Data might be corrupted.");
            console.error("Failed to load session:", error);
        }
    };

    const handleReset = () => {
        if (confirm("Are you sure you want to clear all data and results? This will reset the current analysis session.")) {
            setIsDemoMode(false);
            setResults([]);
            setProgress(0);
            setTotalForProgress(0);
            setAnalysisPhase('idle');
            setLogs(["System reset. Ready for new analysis."]);
            setActiveTab('setup');
            runningRef.current = false;
            addLog("System state has been reset.");
        }
    };

    const handleEnableDemoMode = () => {
        setIsDemoMode(true);
        const demoInputs = Array.from(new Set(DEMO_ENTITIES_DATA.map(d => d["Input Entity"])));
        setEntityList(demoInputs);
        setTextAreaContent(demoInputs.join('\n'));
        setFileName('real_world_compounds_demo.txt');
        setResults([]);
        setProgress(0);
        setTotalForProgress(0);
        setAnalysisPhase('idle');
        addLog("ECO-ID Real-world research Demo Mode loaded!");
        addLog(`Contains ${demoInputs.length} biological and chemical compounds loaded from real research.`);
        addLog("Click 'Initialize Analysis' to run a simulated real-time resolution pipeline without needing API keys.");
    };

    const handleDisableDemoMode = () => {
        setIsDemoMode(false);
        setEntityList([]);
        setTextAreaContent('');
        setFileName('');
        setResults([]);
        setProgress(0);
        setTotalForProgress(0);
        setAnalysisPhase('idle');
        addLog("Demo Mode disabled. Ready for standard user inputs and config.");
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsDemoMode(false);
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                setEntityList(lines);
                setFileName(file.name);
                setTextAreaContent('');
                addLog(`Imported ${lines.length} entities from ${file.name}`);
            };
            reader.readAsText(file);
            event.target.value = '';
        }
    };
    
    const handleTextAreaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setIsDemoMode(false);
        const content = event.target.value;
        setTextAreaContent(content);
        const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        setEntityList(lines);
        if (lines.length > 0) setFileName('');
    };
    
    const handleStop = () => {
        runningRef.current = false;
        addLog("Termination signal sent. Finalizing pending request...");
    };

    const processEntity = async (entity: string, isDeepSearch: boolean): Promise<EntityResult[]> => {
        const startTime = performance.now();
        if (isDemoMode) {
            // Simulated active pipeline delay
            await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 150));
            const matchedData = DEMO_ENTITIES_DATA.filter(d => d["Input Entity"]?.toLowerCase() === entity.toLowerCase());
            if (matchedData.length > 0) {
                const resultsCopy = matchedData.map(item => {
                    const itemCopy = { ...item };
                    // If currently in Deep Search, simulate successful resolution of ambiguous/failed items:
                    if (isDeepSearch) {
                        if (itemCopy["Input Entity"] === "dimethylarginine") {
                            itemCopy["Validation Issues"] = "";
                            itemCopy["Verification Status"] = "Verified";
                            itemCopy["Confidence Score"] = 0.99;
                        } else if (itemCopy["Input Entity"] === "linolenate_[alpha_or_gamma_(18:3n3_or_6") {
                            itemCopy["Resolved Name"] = "alpha-Linolenic acid (18:3n3) [Resolved via Deep Search]";
                            itemCopy["Validation Issues"] = "";
                            itemCopy["Verification Status"] = "Verified";
                            itemCopy["Confidence Score"] = 0.95;
                            itemCopy["Alternative Suggestions"] = "gamma-Linolenic acid (18:3n6) also cross-referenced";
                        }
                    }
                    const endTime = performance.now();
                    itemCopy["Processing Time (s)"] = +((endTime - startTime) / 1000).toFixed(2);
                    return itemCopy;
                });
                return resultsCopy;
            } else {
                // Return fallback for items typed in demo mode that are NOT in pre-stored list
                const endTime = performance.now();
                return [{
                    "Input Entity": entity,
                    "Refined Entity Name": entity,
                    "Entity Type": "chemical",
                    "Resolved Name": "Unknown Compound",
                    "Confidence Score": 0.5,
                    "Resolution Category": "Failed",
                    "Verification Status": "Unverified",
                    "Validation Issues": "Compound not in preloaded demo catalog. Disable Demo Mode for active search.",
                    "Processing Time (s)": +((endTime - startTime) / 1000).toFixed(2)
                } as EntityResult];
            }
        }

        const apiResponse = await fetchEntityInfo(
            apiProvider, 
            apiKey, 
            entity, 
            entityType, 
            backgroundInfo, 
            ontology, 
            isDeepSearch,
            strictDeterminism,
            temperature,
            topP
        );
        
        // Primary Verification
        const verification = await verifyEntity(apiResponse.identifiers, apiResponse.entity_type);
        const endTime = performance.now();
        const procTime = (endTime - startTime) / 1000;

        const mainResult: EntityResult = {
            "Input Entity": entity,
            "Refined Entity Name": apiResponse.corrected_name !== entity ? apiResponse.corrected_name : "",
            "Entity Type": apiResponse.entity_type,
            "Resolved Name": apiResponse.resolved_name,
            "Confidence Score": apiResponse.confidence,
            "Resolution Category": apiResponse.resolution_category,
            "Error Taxonomy": apiResponse.error_taxonomy,
            "Verification Status": verification.status,
            "Verification Method": verification.method,
            "Validation Issues": apiResponse.validation_issues.join('; '),
            "Candidates": apiResponse.candidates?.map(c => `${c.name} (${c.id})`).join(', '),
            "Is Ambiguous": apiResponse.is_ambiguous,
            "Alternative Suggestions": apiResponse.alternative_suggestions?.join(', '),
            "Pathways": apiResponse.pathways.join('; '),
            "Function": apiResponse.biological_function.join('; '),
            "Cellular Component": apiResponse.cellular_component.join('; '),
            "Ontology ID": apiResponse.ontology_id,
            "Ontology Term": apiResponse.ontology_term,
            ...apiResponse.identifiers,
            ...apiResponse.links,
            "Processing Time (s)": procTime,
        };

        if (!multiCandidateMode || !apiResponse.candidates || apiResponse.candidates.length <= 1) {
            return [mainResult];
        }

        // Return primary + filtered candidates
        const extraResults: EntityResult[] = apiResponse.candidates
            .filter(c => c.name !== apiResponse.resolved_name && c.confidence > 0.3)
            .map(c => ({
                "Input Entity": entity,
                "Refined Entity Name": apiResponse.corrected_name !== entity ? apiResponse.corrected_name : "",
                "Entity Type": apiResponse.entity_type,
                "Resolved Name": c.name,
                "Confidence Score": c.confidence,
                "Verification Status": "Unverified",
                "Verification Method": "N/A (Candidate)",
                "Validation Issues": "Alternative hit",
                "Candidates": "Alternative Resolution",
                // Note: identifiers for candidates are often just IDs, we try to map them
                ...(c.source.toLowerCase().includes('uniprot') ? { "UniProt": c.id } : {}),
                ...(c.source.toLowerCase().includes('pubchem') ? { "PubChem CID": c.id } : {}),
                ...(c.source.toLowerCase().includes('chembl') ? { "ChEMBL ID": c.id } : {}),
                "Processing Time (s)": procTime,
            } as EntityResult));

        return [mainResult, ...extraResults];
    };

    const runAnalysis = async (list: string[], isDeepSearch: boolean) => {
        const currentResults = isDeepSearch ? [...results] : [];
        setTotalForProgress(list.length);
        let totalTime = 0;
        
        for (let i = 0; i < list.length; i++) {
            if (!runningRef.current) { addLog(`Execution aborted by user.`); break; }
            const entity = list[i];
            addLog(`${isDeepSearch ? "Deep Search" : "Resolving"} (${i + 1}/${list.length}): ${entity}`);
            
            try {
                if (i > 0) await new Promise(resolve => setTimeout(resolve, 1200)); // Optimized rate limiting
                const entityResults = await processEntity(entity, isDeepSearch);
                totalTime += entityResults[0]["Processing Time (s)"] || 0;

                if (isDeepSearch) {
                    // Replace the first match for deep search (simplification)
                    const resultIndex = currentResults.findIndex(r => r["Input Entity"] === entity);
                    if(resultIndex !== -1) {
                        currentResults.splice(resultIndex, 1, ...entityResults);
                    } else {
                        currentResults.push(...entityResults);
                    }
                } else {
                    currentResults.push(...entityResults);
                }
                addLog(`Success: ${entity} resolved to ${entityResults[0]["Resolved Name"] || 'Unknown'} (${entityResults.length} hits)`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Network or Provider error.";
                addLog(`Failed '${entity}': ${errorMessage}`);
                if (
                    errorMessage.includes("Restriction Required") || 
                    errorMessage.includes("unrestricted") || 
                    errorMessage.includes("disruptions") ||
                    errorMessage.includes("GCP Credentials")
                ) {
                    setKeyAlert(errorMessage);
                }
                if (!isDeepSearch) {
                     currentResults.push({ "Input Entity": entity, "Validation Issues": `Resolution error: ${errorMessage}` } as EntityResult);
                }
            }
            setResults([...currentResults]);
            setProgress(i + 1);
        }
        
        const resolvedCount = currentResults.filter(r => !r["Validation Issues"]).length;
        addLog(`--- Analysis Cycle Complete ---`);
        addLog(`Metrics: ${resolvedCount}/${list.length} resolved (${((resolvedCount / list.length) * 100 || 0).toFixed(1)}%)`);
        addLog(`Performance: Avg ${(totalTime / list.length || 0).toFixed(2)}s per entity`);
        
        return currentResults;
    }

    const handleStart = async () => {
        if (entityList.length === 0) { addLog("Error: Input list is empty."); return; }
        if (apiProvider !== 'Google Gemini' && !apiKey) { addLog(`Error: API credentials missing for ${apiProvider}.`); return; }
        
        setKeyAlert(null);
        setActiveTab('execution');
        setAnalysisPhase('initial');
        runningRef.current = true;
        setResults([]);
        setProgress(0);
        
        addLog(`--- Initiating Analysis: ${entityList.length} entities via ${apiProvider} ---`);
        const newResults = await runAnalysis(entityList, false);
        
        const runId = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        generateAndDownloadCsv(newResults, `eco-id-results-${runId}.csv`);
        addLog(`Report generated: eco-id-results-${runId}.csv`);
        
        const failedEntities = newResults.filter(r => r["Validation Issues"]);
        if (failedEntities.length > 0 && runningRef.current) {
            setAnalysisPhase('deep_search_pending');
            addLog(`${failedEntities.length} entities require Deep Search.`);
        } else {
            setAnalysisPhase('complete');
            addLog("Analysis finalized successfully.");
        }
        runningRef.current = false;
        if (analysisPhase !== 'deep_search_pending') setActiveTab('results');
    };

    const handleDeepSearch = async () => {
        const failedEntitiesList = results.filter(r => r["Validation Issues"]).map(r => r["Input Entity"]);
        if (failedEntitiesList.length === 0) { addLog("No targets for Deep Search."); return; }
        
        setActiveTab('execution');
        setAnalysisPhase('deep_searching');
        runningRef.current = true;
        setProgress(0);
        
        addLog(`--- Initiating Deep Search: ${failedEntitiesList.length} entities ---`);
        const finalResults = await runAnalysis(failedEntitiesList, true);
        
        const runId = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        generateAndDownloadCsv(finalResults, `eco-id-final-report-${runId}.csv`);
        addLog(`Final report generated: eco-id-final-report-${runId}.csv`);
        
        setAnalysisPhase('complete');
        runningRef.current = false;
        setActiveTab('results');
    };

    const isProcessing = analysisPhase === 'initial' || analysisPhase === 'deep_searching';
    const failedCount = results.filter(r => r["Validation Issues"]).length;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
            <AnimatePresence>
                {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}
            </AnimatePresence>

            <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* Header Section */}
                <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
                    <div className="flex items-center space-x-4">
                        <div className="bg-indigo-600 p-3 rounded-2xl shadow-lg shadow-indigo-200">
                            <Database className="h-8 w-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">ECO-ID</h1>
                            <p className="text-slate-500 font-medium">Precision Biological & Chemical Entity Resolution</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button 
                            onClick={handleReset}
                            className="flex items-center px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
                        >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            New Analysis
                        </button>
                        <button 
                            onClick={() => setIsHelpOpen(true)}
                            className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                        >
                            <HelpCircle className="h-6 w-6" />
                        </button>
                    </div>
                </header>

                <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Sidebar Navigation */}
                    <nav className="lg:col-span-3 space-y-2">
                        {[
                            { id: 'setup', label: '1. Configuration', icon: Settings },
                            { id: 'execution', label: '2. Execution', icon: Play },
                            { id: 'results', label: '3. Results', icon: BarChart3 },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as AppTab)}
                                className={`w-full flex items-center px-4 py-3.5 text-sm font-bold rounded-2xl transition-all ${
                                    activeTab === tab.id 
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                                    : 'text-slate-500 hover:bg-white hover:text-slate-800'
                                }`}
                            >
                                <tab.icon className={`h-5 w-5 mr-3 ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`} />
                                {tab.label}
                                {activeTab === tab.id && <ChevronRight className="ml-auto h-4 w-4 opacity-50" />}
                            </button>
                        ))}

                        <div className="mt-8 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Session Info</h4>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-slate-400 mb-1">Active Provider</p>
                                    <p className="text-sm font-bold text-slate-700">
                                        {isDemoMode ? "Research Demo (Simulated)" : apiProvider}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 mb-1">Status</p>
                                    {isDemoMode ? (
                                        <span className="px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full flex items-center">
                                            <Database className="h-3 w-3 mr-1 animate-pulse" />
                                            Demo Active
                                        </span>
                                    ) : (
                                        <ApiKeyStatus provider={apiProvider} apiKey={apiKey} />
                                    )}
                                </div>
                                <div className="pt-2 flex space-x-2">
                                    <button onClick={handleSaveSession} className="flex-1 p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors" title="Save Session">
                                        <Save className="h-4 w-4 mx-auto" />
                                    </button>
                                    <button onClick={handleLoadSession} className="flex-1 p-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors" title="Load Session">
                                        <Download className="h-4 w-4 mx-auto" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </nav>

                    {/* Main Content Area */}
                    <div className="lg:col-span-9">
                        {keyAlert && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mb-6 p-6 bg-slate-50 border border-amber-200 rounded-2xl shadow-sm text-slate-800"
                            >
                                <div className="flex items-start">
                                    <div className="bg-amber-100 p-2 rounded-xl mr-4 flex-shrink-0">
                                        <AlertCircle className="h-6 w-6 text-amber-600" />
                                    </div>
                                    {!apiKey ? (
                                        <div className="space-y-2 w-full">
                                            <h4 className="font-bold text-amber-950 flex items-center">
                                                ⚠️ Workspace Gemini Key Notice
                                            </h4>
                                            <div className="text-sm text-slate-700 leading-relaxed font-semibold">
                                                The default system API key is encountering Google's new mid-June 2026 restrictions on unrestricted keys in this cloud container region.
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border border-amber-100 text-xs font-semibold text-slate-700 space-y-2.5 mt-3 shadow-inner">
                                                <p className="text-slate-800 font-bold">How to resolve instantly:</p>
                                                <p className="leading-relaxed">
                                                    You do not need to restrict the system key! To run all requests completely error-free and bypass public restrictions:
                                                </p>
                                                <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-600">
                                                    <li>Generate a free personal API key at the <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-bold hover:text-indigo-800">Google AI Studio Portal</a>.</li>
                                                    <li>Click the <strong>Setup</strong> tab in this app.</li>
                                                    <li>Paste your new key under <strong className="text-slate-800">API Key</strong>.</li>
                                                    <li>Click <strong className="text-emerald-600">&quot;Initialize Analysis&quot;</strong> and run seamlessly!</li>
                                                </ol>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 w-full">
                                            <h4 className="font-bold text-amber-950 flex items-center">
                                                ⚠️ Action Required: Google Cloud API Key Restriction Enforcement
                                            </h4>
                                            <div className="text-sm text-slate-700 leading-relaxed font-semibold">
                                                Google has restricted unrestricted API keys for Gemini models (effective mid-June 2026). Your current key is unrestricted and is experiencing temporary 403 blocks.
                                            </div>
                                            <div className="bg-white p-4 rounded-xl border border-amber-100 text-xs font-semibold text-slate-700 space-y-2.5 mt-3 shadow-inner">
                                                <p className="text-slate-800 font-bold">Follow these steps to authorize your key instantly:</p>
                                                <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-600">
                                                    <li>Open the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline font-bold hover:text-indigo-800">Google Cloud Console Credentials Dashboard</a>.</li>
                                                    <li>Click on the specific API Key you are using (e.g., &quot;API Key 1&quot; or your active key).</li>
                                                    <li>Go down to <strong className="text-slate-800">API restrictions</strong>, change selection to <strong className="text-slate-800">&quot;Restrict key&quot;</strong>.</li>
                                                    <li>In the dropdown, select <strong className="text-slate-800">Generative Language API</strong> and click Save.</li>
                                                    <li>Wait 1-2 minutes for propagation, then click <strong className="text-emerald-600">&quot;Initialize Analysis&quot;</strong> to resume!</li>
                                                </ol>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                        <AnimatePresence mode="wait">
                            {/* Setup Tab Content */}
                            {activeTab === 'setup' && (
                                <motion.div
                                    key="setup"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="space-y-8"
                                >
                                    {/* Demo Mode Highlight Panel */}
                                    <div className={`p-6 rounded-2xl border transition-all duration-300 ${
                                        isDemoMode 
                                        ? 'bg-indigo-50 border-indigo-200 shadow-sm shadow-indigo-100 animate-pulse-subtle' 
                                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                                    }`}>
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="space-y-1">
                                                <div className="flex items-center space-x-2">
                                                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isDemoMode ? 'bg-indigo-600' : 'bg-slate-400'}`}></span>
                                                    <h3 className="text-base font-bold text-slate-800">
                                                        ECO-ID Research Demo Mode
                                                    </h3>
                                                    {isDemoMode && (
                                                        <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 bg-indigo-600 text-white rounded">
                                                            Active
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-sm text-slate-500 font-medium">
                                                    Try ECO-ID instantly with real research compounds and pre-resolved biochemical metadata. No API keys or configurations needed.
                                                </p>
                                            </div>
                                            <div>
                                                {!isDemoMode ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleEnableDemoMode}
                                                        className="w-full md:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                                                    >
                                                        <Database className="h-4 w-4 mr-2" />
                                                        Load Research Demo
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={handleDisableDemoMode}
                                                        className="w-full md:w-auto px-5 py-2.5 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                                                    >
                                                        <RotateCcw className="h-4 w-4 mr-2 text-slate-400" />
                                                        Exit Demo Mode
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                                            <h3 className="text-lg font-bold text-slate-800 flex items-center">
                                                <Settings className="h-5 w-5 mr-2 text-indigo-600" />
                                                API Configuration
                                            </h3>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Provider</label>
                                                    <select 
                                                        value={apiProvider} 
                                                        onChange={e => setApiProvider(e.target.value as ApiProvider)}
                                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                                    >
                                                        {apiProviders.map(p => <option key={p}>{p}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">API Key</label>
                                                    <input 
                                                        type="password" 
                                                        value={apiKey} 
                                                        onChange={e => setApiKey(e.target.value)}
                                                        placeholder={apiProvider === 'Google Gemini' ? 'Using environment key...' : 'Enter credentials'}
                                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
                                                    />
                                                </div>
                                            </div>

                                            <div className="pt-4 border-t border-slate-100 space-y-4">
                                                <h4 className="text-sm font-bold text-slate-800">Search Parameters</h4>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Type Hint</label>
                                                        <select 
                                                            value={entityType} 
                                                            onChange={e => setEntityType(e.target.value as EntityType)}
                                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
                                                        >
                                                            <option>Auto</option><option>Chemical</option><option>Protein</option><option>Gene</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ontology</label>
                                                        <select 
                                                            value={ontology} 
                                                            onChange={e => setOntology(e.target.value as OntologyType)}
                                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium"
                                                        >
                                                            {ontologies.map(o => <option key={o}>{o}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2 pt-2">
                                                    <input 
                                                        type="checkbox" 
                                                        id="multiCandidate"
                                                        checked={multiCandidateMode}
                                                        onChange={e => setMultiCandidateMode(e.target.checked)}
                                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                    />
                                                    <label htmlFor="multiCandidate" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                                                        Multi-Candidate Resolution
                                                    </label>
                                                    <div className="group relative">
                                                        <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-help" />
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                                                            Returns all high-confidence alternative hits for ambiguous names instead of just the primary result.
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col space-y-2 pt-2 border-t border-slate-100">
                                                    <div className="flex items-center space-x-2">
                                                        <input 
                                                            type="checkbox" 
                                                            id="strictDeterminism"
                                                            checked={strictDeterminism}
                                                            onChange={e => {
                                                                setStrictDeterminism(e.target.checked);
                                                                if (e.target.checked) {
                                                                    setTemperature(0);
                                                                    setTopP(0);
                                                                }
                                                            }}
                                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                                        />
                                                        <label htmlFor="strictDeterminism" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                                                            Strict Determinism Mode
                                                        </label>
                                                        <div className="group relative">
                                                            <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-help" />
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                                                                Enforces temperature: 0 and top_p: 0 for identical, reproducible interpretations across repeated executions.
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {!strictDeterminism && (
                                                        <div className="pl-6 space-y-3 pt-1 border-l-2 border-indigo-100">
                                                            <div>
                                                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                                    <span>Temperature: {temperature.toFixed(2)}</span>
                                                                </div>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max="2" 
                                                                    step="0.1" 
                                                                    value={temperature} 
                                                                    onChange={e => setTemperature(parseFloat(e.target.value))}
                                                                    className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                />
                                                            </div>
                                                            <div>
                                                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                                    <span>Top P: {topP.toFixed(2)}</span>
                                                                </div>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max="1" 
                                                                    step="0.05" 
                                                                    value={topP} 
                                                                    onChange={e => setTopP(parseFloat(e.target.value))}
                                                                    className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Contextual Info</label>
                                                    <textarea 
                                                        rows={3} 
                                                        value={backgroundInfo} 
                                                        onChange={e => setBackgroundInfo(e.target.value)}
                                                        placeholder="Optional biological context..."
                                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </section>

                                        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                                            <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                                                <Upload className="h-5 w-5 mr-2 text-indigo-600" />
                                                Data Ingestion
                                            </h3>
                                            <div className="flex-grow flex flex-col">
                                                <div className="relative group flex-grow flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-8 bg-slate-50 hover:bg-white hover:border-indigo-300 transition-all cursor-pointer">
                                                    <input 
                                                        type="file" 
                                                        className="absolute inset-0 opacity-0 cursor-pointer" 
                                                        accept=".txt" 
                                                        onChange={handleFileChange} 
                                                    />
                                                    <div className="bg-white p-4 rounded-2xl shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                                        <Upload className="h-8 w-8 text-indigo-600" />
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-700">Drop .txt file here</p>
                                                    <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                                                </div>

                                                <div className="my-6 flex items-center">
                                                    <div className="flex-grow h-px bg-slate-100"></div>
                                                    <span className="px-4 text-[10px] font-bold text-slate-300 uppercase tracking-widest">Manual Entry</span>
                                                    <div className="flex-grow h-px bg-slate-100"></div>
                                                </div>

                                                <textarea 
                                                    rows={6} 
                                                    value={textAreaContent} 
                                                    onChange={handleTextAreaChange}
                                                    placeholder="Paste entity names (one per line)..."
                                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                                                />
                                                
                                                <div className="mt-4 flex items-center justify-between">
                                                    <div className="flex items-center text-xs font-bold text-slate-400">
                                                        <FileText className="h-3 w-3 mr-1.5" />
                                                        {entityList.length} Entities Loaded
                                                    </div>
                                                    {fileName && (
                                                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md font-bold truncate max-w-[150px]">
                                                            {fileName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </section>
                                    </div>

                                    {/* Prominent Run Button in Setup Tab */}
                                    <div className="flex justify-center pt-4">
                                        <button
                                            onClick={handleStart}
                                            disabled={entityList.length === 0 || isProcessing}
                                            className="group relative flex items-center px-10 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all disabled:bg-slate-300 disabled:shadow-none disabled:translate-y-0"
                                        >
                                            <Play className="h-5 w-5 mr-3 fill-current" />
                                            Initialize Analysis
                                            <ChevronRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* Execution Tab Content */}
                            {activeTab === 'execution' && (
                                <motion.div
                                    key="execution"
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    className="space-y-8"
                                >
                                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                            <div className="space-y-1">
                                                <h3 className="text-2xl font-bold text-slate-800">Processing Pipeline</h3>
                                                <p className="text-slate-500 font-medium">Monitoring real-time entity resolution</p>
                                            </div>
                                            <div className="flex space-x-3">
                                                {!isProcessing ? (
                                                    <button 
                                                        onClick={handleStart} 
                                                        disabled={entityList.length === 0 || analysisPhase === 'complete'} 
                                                        className="flex items-center px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:bg-slate-200 disabled:shadow-none"
                                                    >
                                                        <Play className="h-5 w-5 mr-2 fill-current" />
                                                        Start Analysis
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={handleStop} 
                                                        className="flex items-center px-6 py-3 bg-rose-600 text-white font-bold rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                                                    >
                                                        <Square className="h-5 w-5 mr-2 fill-current" />
                                                        Stop Pipeline
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Progress Section */}
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-end">
                                                <div className="flex items-center space-x-3">
                                                    <div className={`p-2 rounded-lg ${isProcessing ? 'bg-indigo-100 animate-pulse' : 'bg-slate-100'}`}>
                                                        <Search className={`h-5 w-5 ${isProcessing ? 'text-indigo-600' : 'text-slate-400'}`} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700">
                                                            {isProcessing ? 'Active Processing...' : analysisPhase === 'complete' ? 'Analysis Complete' : 'Idle'}
                                                        </p>
                                                        <p className="text-xs text-slate-400 font-medium">
                                                            {progress} of {totalForProgress || entityList.length} entities
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-2xl font-black text-indigo-600">
                                                    {Math.round((progress / (totalForProgress || 1)) * 100)}%
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(progress / (totalForProgress || 1)) * 100}%` }}
                                                    className="bg-indigo-600 h-full rounded-full shadow-[0_0_15px_rgba(79,70,229,0.4)]"
                                                />
                                            </div>
                                        </div>

                                        {/* Deep Search Callout */}
                                        {analysisPhase === 'deep_search_pending' && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="p-6 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col md:flex-row items-center gap-6"
                                            >
                                                <div className="bg-white p-3 rounded-xl shadow-sm">
                                                    <Search className="h-8 w-8 text-amber-500" />
                                                </div>
                                                <div className="flex-grow text-center md:text-left">
                                                    <h4 className="text-lg font-bold text-amber-900">Deep Search Recommended</h4>
                                                    <p className="text-sm text-amber-700 font-medium">{failedCount} entities could not be resolved with standard methods. Run intensive search?</p>
                                                </div>
                                                <button 
                                                    onClick={handleDeepSearch} 
                                                    className="w-full md:w-auto px-8 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all shadow-md shadow-amber-100"
                                                >
                                                    Start Deep Search
                                                </button>
                                            </motion.div>
                                        )}

                                        {/* Console Logs */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Console</h4>
                                                <span className="flex items-center text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded uppercase">
                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
                                                    Live Output
                                                </span>
                                            </div>
                                            <div 
                                                ref={logContainerRef} 
                                                className="bg-slate-900 text-indigo-300 font-mono text-[13px] rounded-2xl p-6 h-80 overflow-y-auto shadow-inner border border-slate-800 custom-scrollbar"
                                            >
                                                {logs.map((log, i) => (
                                                    <div key={i} className="mb-1.5 flex">
                                                        <span className="text-slate-600 mr-3 select-none">{(i + 1).toString().padStart(3, '0')}</span>
                                                        <p className="whitespace-pre-wrap leading-relaxed">{log}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* Results Tab Content */}
                            {activeTab === 'results' && (
                                <motion.div
                                    key="results"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="space-y-8"
                                >
                                    {results.length > 0 ? (
                                        <div className="space-y-12">
                                            {/* Summary Stats */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                                {[
                                                    { label: 'Total Entities', value: results.length, icon: FileText, color: 'indigo' },
                                                    { label: 'Resolved', value: results.filter(r => !r["Validation Issues"]).length, icon: CheckCircle2, color: 'emerald' },
                                                    { label: 'Issues Found', value: results.filter(r => r["Validation Issues"]).length, icon: AlertCircle, color: 'amber' },
                                                    { label: 'Avg Time', value: `${(results.reduce((acc, r) => acc + (r["Processing Time (s)"] || 0), 0) / results.length).toFixed(2)}s`, icon: Play, color: 'blue' },
                                                ].map((stat, i) => (
                                                    <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                                                        <div className={`p-3 rounded-xl bg-${stat.color}-50 text-${stat.color}-600`}>
                                                            <stat.icon className="h-6 w-6" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                                                            <p className="text-xl font-black text-slate-800">{stat.value}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <ResultsTable results={results} />
                                            <VisualizationDashboard results={results} />

                                            {/* Post-Analysis Actions */}
                                            <div className="pt-8 border-t border-slate-200 flex flex-col items-center space-y-4">
                                                <p className="text-slate-500 font-medium">Analysis complete. What would you like to do next?</p>
                                                <div className="flex flex-wrap justify-center gap-4">
                                                    <button 
                                                        onClick={() => generateAndDownloadCsv(results, `eco-id-export-${new Date().getTime()}.csv`)}
                                                        className="flex items-center px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-50 transition-all shadow-sm"
                                                    >
                                                        <Download className="h-5 w-5 mr-2" />
                                                        Download CSV
                                                    </button>
                                                    <button 
                                                        onClick={handleReset}
                                                        className="flex items-center px-6 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                                                    >
                                                        <RotateCcw className="h-5 w-5 mr-2" />
                                                        Start New Analysis
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center space-y-6">
                                            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                                                <BarChart3 className="h-12 w-12 text-slate-300" />
                                            </div>
                                            <div className="max-w-md mx-auto">
                                                <h3 className="text-2xl font-bold text-slate-800">No Data Available</h3>
                                                <p className="text-slate-500 mt-2 font-medium">Configure your entity list and run the resolution pipeline to see results and visualizations here.</p>
                                            </div>
                                            <button 
                                                onClick={() => setActiveTab('setup')}
                                                className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                                            >
                                                Go to Configuration
                                            </button>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>

                <footer className="mt-20 pt-8 border-t border-slate-200 text-center">
                    <div className="flex items-center justify-center space-x-2 text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em]">
                        <Database className="h-3 w-3" />
                        <span>ECO-ID Research Tool</span>
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span>v4.5.0-PRO</span>
                    </div>
                </footer>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #334155;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #475569;
                }
            `}</style>
        </div>
    );
};

export default App;
