import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, ImageIcon, Loader2, Link as LinkIcon, Globe } from 'lucide-react';
import useDocumentStore from '../../stores/useDocumentStore';

const FileUpload = ({ onComplete, selectedFolderId: initialFolderId }) => {
    const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'link'
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [category, setCategory] = useState('');
    const [folderId, setFolderId] = useState(initialFolderId || '');
    const [isUploading, setIsUploading] = useState(false);

    const { uploadDocument, addLinkDocument, folders } = useDocumentStore();

    const onDrop = useCallback((acceptedFiles) => {
        const selectedFile = acceptedFiles[0];
        setFile(selectedFile);
        if (selectedFile) {
            // Auto-fill title from filename without extension
            setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'image/*': ['.jpg', '.jpeg', '.png'],
            'text/markdown': ['.md'],
            'text/plain': ['.txt']
        },
        multiple: false
    });

    const handleUpload = async () => {
        if (activeTab === 'upload') {
            if (!file || !title) return;

            setIsUploading(true);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', title);
            formData.append('category', category);
            if (folderId && folderId !== 'unfiled') {
                formData.append('folder_id', folderId);
            }

            try {
                await uploadDocument(formData);
                resetForm();
                if (onComplete) onComplete();
            } catch (err) {
                console.error('Upload failed', err);
                alert(`Upload failed: ${err}`);
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
                    tags: category ? category.split(',').map(t => t.trim()) : []
                });
                resetForm();
                if (onComplete) onComplete();
            } catch (err) {
                console.error('Link addition failed', err);
                alert(`Failed to add link: ${err}`);
            } finally {
                setIsUploading(false);
            }
        }
    };

    const resetForm = () => {
        setFile(null);
        setTitle('');
        setUrl('');
        setCategory('');
        setFolderId(initialFolderId || '');
    };

    return (
        <div className="space-y-6 animate-scale-in">
            {/* Tab Switcher */}
            {!file && (
                <div className="flex p-1 bg-white/5 rounded-2xl w-fit mx-auto border border-white/10">
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'upload' ? 'bg-primary-500 text-white shadow-lg' : 'text-dark-400 hover:text-dark-200'}`}
                    >
                        <Upload className="w-4 h-4" />
                        Upload File
                    </button>
                    <button
                        onClick={() => setActiveTab('link')}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'link' ? 'bg-primary-500 text-white shadow-lg' : 'text-dark-400 hover:text-dark-200'}`}
                    >
                        <LinkIcon className="w-4 h-4" />
                        Add Link
                    </button>
                </div>
            )}

            {activeTab === 'upload' ? (
                !file ? (
                    <div
                        {...getRootProps()}
                        className={`
                            border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
                            ${isDragActive ? 'border-primary-500 bg-primary-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}
                        `}
                    >
                        <input {...getInputProps()} />
                        <div className="mx-auto w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Upload className="w-8 h-8 text-dark-400" />
                        </div>
                        <p className="text-lg font-medium">Click or drag document here</p>
                        <p className="text-sm text-dark-500 mt-1">Supports PDF, Image, Markdown, Text (Max 50MB)</p>
                    </div>
                ) : (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative">
                        <button
                            onClick={() => setFile(null)}
                            className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-dark-400" />
                        </button>

                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 rounded-xl bg-primary-500/20">
                                {file.type === 'application/pdf' ? (
                                    <FileText className="w-8 h-8 text-primary-400" />
                                ) : (
                                    <ImageIcon className="w-8 h-8 text-primary-400" />
                                )}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <p className="font-semibold truncate text-white">{file.name}</p>
                                <p className="text-xs text-dark-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
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
                            buttonText="Upload and Start Learning"
                        />
                    </div>
                )
            ) : (
                <div className="bg-dark-900 border border-white/10 rounded-2xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-600 via-primary-400 to-primary-600 opacity-50" />
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-lg bg-primary-500/10">
                                <Globe className="w-5 h-5 text-primary-400" />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">External Resource</h4>
                                <p className="text-[10px] text-dark-500 font-bold uppercase tracking-widest">Add ArXiv, Blog posts, or Wiki pages</p>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-dark-400 uppercase tracking-widest mb-2 opacity-70">Resource URL</label>
                            <div className="relative group">
                                <div className="absolute inset-0 bg-primary-500/5 rounded-xl blur-lg group-focus-within:bg-primary-500/10 transition-all" />
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500 group-focus-within:text-primary-400 transition-colors z-10" />
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    placeholder="https://arxiv.org/pdf/..."
                                    className="relative w-full bg-dark-800 border-white/10 text-white pl-12 h-14 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 transition-all z-10"
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
                            buttonText="Add Resource to Library"
                            isLink={true}
                            url={url}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const FormInputs = ({ title, setTitle, category, setCategory, folderId, setFolderId, folders, handleUpload, isUploading, buttonText, isLink, url }) => (
    <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-dark-500 uppercase tracking-widest mb-2">Document Title</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter document title"
                    className="w-full bg-dark-800 border-white/10 text-white"
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-dark-500 uppercase tracking-widest mb-2">Move to Folder</label>
                <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full bg-dark-800 border-white/10 text-white h-[42px] px-3 rounded-xl focus:outline-none focus:border-primary-500 transition-colors"
                >
                    <option value="">Unfiled</option>
                    {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
            </div>
        </div>

        <div>
            <label className="block text-xs font-bold text-dark-500 uppercase tracking-widest mb-2">Category (Optional tags)</label>
            <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Mathematics, History"
                className="w-full bg-dark-800 border-white/10 text-white"
            />
        </div>

        <button
            onClick={handleUpload}
            disabled={isUploading || !title || (isLink && !url)}
            className="btn-primary w-full mt-6 h-14 flex items-center justify-center gap-3 shadow-2xl shadow-primary-500/20 text-sm font-black uppercase tracking-[0.2em]"
        >
            {isUploading ? (
                <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Syncing...
                </>
            ) : (
                <>
                    {isLink ? <LinkIcon className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                    {buttonText}
                </>
            )}
        </button>
    </div>
);

export default FileUpload;
