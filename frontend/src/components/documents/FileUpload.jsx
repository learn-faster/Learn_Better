import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, ImageIcon, Loader2, Link as LinkIcon, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useDocumentStore from '../../stores/useDocumentStore';
import useFolderStore from '../../stores/useFolderStore';

const FileUpload = ({ onComplete, selectedFolderId: initialFolderId }) => {
    const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'link'
    const [files, setFiles] = useState([]);
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [category, setCategory] = useState('');
    const [folderId, setFolderId] = useState(initialFolderId || '');
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const [uploadMode, setUploadMode] = useState('sequential');
    const [autoIngest, setAutoIngest] = useState(false);

    const { uploadDocument, addLinkDocument } = useDocumentStore();
    const { folders } = useFolderStore();

    const onDrop = useCallback((acceptedFiles) => {
        if (!acceptedFiles || acceptedFiles.length === 0) return;
        const newItems = acceptedFiles.map((file) => ({
            id: `${file.name}-${file.size}-${Date.now()}`,
            file,
            title: file.name.replace(/\.[^/.]+$/, "")
        }));
        setFiles((prev) => [...prev, ...newItems]);
        setError(null);
    }, []);

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'image/*': ['.jpg', '.jpeg', '.png'],
            'text/markdown': ['.md'],
            'text/plain': ['.txt']
        },
        multiple: true,
        noClick: files.length > 0
    });

    const handleUpload = async () => {
        setError(null);
        if (activeTab === 'upload') {
            if (!files.length) return;
            setIsUploading(true);
            try {
                const makeFormData = (item) => {
                    const formData = new FormData();
                    formData.append('file', item.file);
                    formData.append('title', item.title || item.file.name);
                    formData.append('category', category);
                    formData.append('auto_ingest', autoIngest ? 'true' : 'false');
                    if (folderId && folderId !== 'unfiled') {
                        formData.append('folder_id', folderId);
                    }
                    return formData;
                };

                let failed = [];
                if (uploadMode === 'parallel') {
                    const results = await Promise.allSettled(
                        files.map((item) => uploadDocument(makeFormData(item)))
                    );
                    failed = files.filter((_, index) => results[index].status === 'rejected');
                } else {
                    for (const item of files) {
                        try {
                            await uploadDocument(makeFormData(item));
                        } catch (err) {
                            failed.push(item);
                        }
                    }
                }

                if (failed.length > 0) {
                    const successCount = files.length - failed.length;
                    setFiles(failed);
                    setError(`${successCount} uploaded, ${failed.length} failed. Fix and retry.`);
                } else {
                    resetForm();
                    if (onComplete) onComplete();
                }
            } catch (err) {
                setError(err.message || 'Neural uplink failed. Verify connection.');
            } finally {
                setIsUploading(false);
            }
        } else {
            if (!url || !title) return;

            setIsUploading(true);
            try {
                await addLinkDocument({
                    url,
                    title,
                    category,
                    folder_id: (folderId && folderId !== 'unfiled') ? folderId : null,
                    tags: category ? category.split(',').map(t => t.trim()) : [],
                    auto_ingest: autoIngest
                });
                resetForm();
                if (onComplete) onComplete();
            } catch (err) {
                setError(err.message || 'External resource synthesis failed.');
            } finally {
                setIsUploading(false);
            }
        }
    };

    const resetForm = () => {
        setFiles([]);
        setTitle('');
        setUrl('');
        setCategory('');
        setFolderId(initialFolderId || '');
        setAutoIngest(false);
        setError(null);
    };

    return (
        <div className="space-y-10">
            {/* Tab Switcher */}
            {files.length === 0 && (
                <div className="flex p-1.5 bg-dark-950/50 rounded-2xl w-fit mx-auto border border-white/5 shadow-inner backdrop-blur-sm">
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${activeTab === 'upload' ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-dark-500 hover:text-dark-300'}`}
                    >
                        <Upload className="w-4 h-4" />
                        Uplink File
                    </button>
                    <button
                        onClick={() => setActiveTab('link')}
                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-3 ${activeTab === 'link' ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-dark-500 hover:text-dark-300'}`}
                    >
                        <LinkIcon className="w-4 h-4" />
                        External URL
                    </button>
                </div>
            )}

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-widest text-center"
                >
                    {error}
                </motion.div>
            )}

            {activeTab === 'upload' ? (
                files.length === 0 ? (
                    <div
                        {...getRootProps()}
                        className={`
                            border-2 border-dashed rounded-[2rem] p-16 text-center transition-all cursor-pointer group relative overflow-hidden
                            ${isDragActive ? 'border-primary-500 bg-primary-500/5 scale-[1.01]' : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'}
                        `}
                    >
                        <input {...getInputProps()} />
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="relative z-10">
                            <div className="mx-auto w-20 h-20 rounded-2xl bg-dark-950 border border-white/5 flex items-center justify-center mb-6 shadow-xl group-hover:scale-105 transition-transform">
                                <Upload className="w-8 h-8 text-primary-400" />
                            </div>
                            <h3 className="text-xl font-black text-white mb-2 tracking-tight">Initialize Ingestion</h3>
                            <p className="text-dark-500 font-bold uppercase tracking-[0.2em] text-[9px] leading-relaxed">
                                PDF • IMAGE • MARKDOWN • TEXT<br />
                                <span className="opacity-40">MAX PAYLOAD: 50MB</span>
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-dark-900/60 border border-white/5 rounded-[2rem] p-8 relative overflow-hidden shadow-xl backdrop-blur-sm space-y-8">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-wider">Upload Queue</h3>
                                <p className="text-[10px] text-dark-500 font-black uppercase tracking-[0.2em]">Multiple files ready</p>
                            </div>
                            <button
                                onClick={() => open()}
                                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest text-white/70 border border-white/10"
                            >
                                Add More
                            </button>
                        </div>

                        <div className="space-y-4 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                            {files.map((item) => (
                                <div key={item.id} className="flex items-center gap-4 p-4 rounded-2xl bg-dark-950/60 border border-white/5">
                                    <div className="p-3 rounded-xl bg-dark-950 border border-white/5">
                                        {item.file.type === 'application/pdf' ? (
                                            <FileText className="w-6 h-6 text-primary-400" />
                                        ) : (
                                            <ImageIcon className="w-6 h-6 text-primary-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <input
                                            type="text"
                                            value={item.title}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, title: next } : f));
                                            }}
                                            className="w-full bg-dark-950 border border-white/5 text-white h-10 px-4 rounded-xl font-medium focus:border-primary-500/50 transition-all placeholder:text-dark-600 shadow-inner"
                                            placeholder="Document title"
                                        />
                                        <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-dark-500 font-black">
                                            <span className="px-2 py-1 rounded-lg bg-primary-500/10 text-primary-400">
                                                {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                                            </span>
                                            <span className="truncate">{item.file.name}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setFiles((prev) => prev.filter((f) => f.id !== item.id))}
                                        className="p-2 bg-white/5 hover:bg-rose-500/10 rounded-xl text-dark-500 hover:text-rose-400 transition-all border border-white/5"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <FormInputs
                            title={title}
                            setTitle={setTitle}
                            category={category}
                            setCategory={setCategory}
                            folderId={folderId}
                            setFolderId={setFolderId}
                            folders={folders}
                            handleUpload={handleUpload}
                            isUploading={isUploading}
                            buttonText="Begin Neural Uplink"
                            showTitle={false}
                            uploadMode={uploadMode}
                            setUploadMode={setUploadMode}
                            autoIngest={autoIngest}
                            setAutoIngest={setAutoIngest}
                        />
                    </div>
                )
            ) : (
                <div className="bg-dark-900/60 border border-white/5 rounded-[2rem] p-8 space-y-8 shadow-xl relative overflow-hidden backdrop-blur-sm">
                    <div className="absolute top-0 left-0 w-full h-1 bg-primary-500 opacity-40" />

                    <div className="flex items-center gap-5 mb-2">
                        <div className="p-4 rounded-xl bg-dark-950 border border-white/5 shadow-xl">
                            <Globe className="w-6 h-6 text-primary-400" />
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="text-lg font-black text-white uppercase tracking-wider">External Synapse</h4>
                            <p className="text-[9px] text-dark-500 font-black uppercase tracking-[0.2em] opacity-40">ArXiv • Research • Open Knowledge</p>
                        </div>
                    </div>

                    <div className="space-y-10">
                        <div className="space-y-4">
                            <label className="block text-[10px] font-black text-primary-400 uppercase tracking-[0.3em] ml-2">Remote Resource Address</label>
                            <div className="relative group">
                                <div className="absolute inset-0 bg-primary-500/5 rounded-[1.5rem] blur-xl group-focus-within:bg-primary-500/10 transition-all" />
                                <Globe className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-dark-600 group-focus-within:text-primary-400 transition-colors z-10" />
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://research-gateway.org/protocol/..."
                                    className="relative w-full bg-dark-900/80 border-white/10 text-white pl-16 h-20 rounded-[1.5rem] text-lg font-bold focus:ring-[12px] focus:ring-primary-500/10 focus:border-primary-500/40 transition-all z-10 shadow-2xl"
                                />
                            </div>
                        </div>

                        <FormInputs
                            title={title}
                            setTitle={setTitle}
                            category={category}
                            setCategory={setCategory}
                            folderId={folderId}
                            setFolderId={setFolderId}
                            folders={folders}
                            handleUpload={handleUpload}
                            isUploading={isUploading}
                            buttonText="Synthesize Resource"
                            isLink={true}
                            url={url}
                            autoIngest={autoIngest}
                            setAutoIngest={setAutoIngest}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const FormInputs = ({
    title,
    setTitle,
    category,
    setCategory,
    folderId,
    setFolderId,
    folders,
    handleUpload,
    isUploading,
    buttonText,
    isLink,
    url,
    showTitle = true,
    uploadMode,
    setUploadMode,
    autoIngest,
    setAutoIngest
}) => (
    <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {showTitle && (
                <div className="space-y-3">
                    <label className="block text-[10px] font-black text-dark-500 uppercase tracking-[0.3em] ml-1">Label</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Document title"
                        className="w-full bg-dark-950 border border-white/5 text-white h-14 px-6 rounded-xl font-medium focus:border-primary-500/50 transition-all placeholder:text-dark-600 shadow-inner"
                    />
                </div>
            )}
            <div className="space-y-3">
                <label className="block text-[10px] font-black text-dark-500 uppercase tracking-[0.3em] ml-1">Destination</label>
                <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full bg-dark-950 border border-white/5 text-white h-14 px-6 rounded-xl font-medium focus:outline-none focus:border-primary-500/50 transition-all appearance-none cursor-pointer shadow-inner"
                >
                    <option value="">UNCATEGORIZED</option>
                    {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name.toUpperCase()}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="space-y-3">
            <label className="block text-[10px] font-black text-dark-500 uppercase tracking-[0.3em] ml-1">Category (Optional)</label>
            <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Physics, Cognitive Science"
                className="w-full bg-dark-950 border border-white/5 text-white h-14 px-6 rounded-xl font-medium focus:border-primary-500/50 transition-all placeholder:text-dark-600 shadow-inner"
            />
        </div>

        <div className="flex flex-col gap-3">
            {setUploadMode && (
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-dark-500">Upload Mode</span>
                    <div className="flex p-1 bg-dark-950/60 rounded-2xl border border-white/5">
                        {['sequential', 'parallel'].map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setUploadMode(mode)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all ${uploadMode === mode ? 'bg-primary-500 text-white' : 'text-dark-500 hover:text-dark-300'}`}
                                type="button"
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <label className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-dark-500">
                <input
                    type="checkbox"
                    checked={Boolean(autoIngest)}
                    onChange={(e) => setAutoIngest && setAutoIngest(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-dark-950"
                />
                Auto build knowledge map after extraction
            </label>
        </div>

        <motion.button
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={handleUpload}
            disabled={isUploading || (showTitle && !title) || (isLink && !url)}
            className="w-full mt-8 h-14 rounded-xl bg-primary-500 hover:bg-primary-600 text-white flex items-center justify-center gap-3 shadow-lg shadow-primary-500/20 text-[11px] font-black uppercase tracking-[0.3em] transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
        >
            {isUploading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Ingesting...
                </>
            ) : (
                <>
                    {isLink ? <Globe className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                    {buttonText}
                </>
            )}
        </motion.button>
    </div>
);

export default FileUpload;
