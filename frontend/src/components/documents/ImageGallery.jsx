import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import api from '../../services/api';

/**
 * ImageGallery - Displays extracted diagrams/images from a document.
 * Used in Phase 1 multimodal ingestion to show visual assets.
 */
const ImageGallery = ({ documentId }) => {
    const [images, setImages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);

    useEffect(() => {
        const fetchImages = async () => {
            try {
                const data = await api.get(`/documents/${documentId}/images`);
                setImages(data || []);
            } catch (err) {
                console.error('Failed to fetch document images', err);
                setImages([]);
            } finally {
                setIsLoading(false);
            }
        };

        if (documentId) {
            fetchImages();
        }
    }, [documentId]);

    useEffect(() => {
        if (selectedImage) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [selectedImage]);

    if (isLoading) {
        return (
            <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                <div className="flex items-center justify-center gap-2 text-dark-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-widest">Loading Visuals...</span>
                </div>
            </div>
        );
    }

    if (images.length === 0) {
        return null; // Don't show anything if no images extracted
    }

    // Extract filename from path for display
    const getFileName = (path) => path?.split(/[/\\]/).pop() || 'Image';

    return (
        <>
            <div className="bg-white/5 rounded-2xl border border-white/5 group hover:border-white/10 transition-colors overflow-hidden">
                {/* Header */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between p-5 text-left"
                >
                    <div className="flex items-center gap-2">
                        <Image className="w-4 h-4 text-primary-400" />
                        <h4 className="text-[10px] font-black text-dark-400 uppercase tracking-[0.2em]">
                            Visual Assets ({images.length})
                        </h4>
                    </div>
                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-dark-500" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-dark-500" />
                    )}
                </button>

                {/* Gallery Grid */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="px-5 pb-5"
                        >
                            <div className="grid grid-cols-2 gap-3">
                                {images.map((img) => (
                                    <motion.div
                                        key={img.id}
                                        whileHover={{ scale: 1.02 }}
                                        className="relative aspect-square rounded-xl overflow-hidden bg-dark-800 border border-white/5 cursor-pointer group/img"
                                        onClick={() => setSelectedImage(img)}
                                    >
                                        <img
                                            src={`http://localhost:8000/extracted_images/${getFileName(img.file_path)}`}
                                            alt={img.caption || 'Extracted image'}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity" />
                                        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover/img:opacity-100 transition-opacity">
                                            <p className="text-[9px] text-white font-bold truncate">
                                                {img.caption || `Page ${img.page_number || '?'}`}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Lightbox Modal */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"
                        onClick={() => setSelectedImage(null)}
                    >
                        <button
                            onClick={() => setSelectedImage(null)}
                            className="absolute top-6 right-6 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                        >
                            <X className="w-6 h-6 text-white" />
                        </button>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="max-w-4xl max-h-[80vh] flex flex-col items-center gap-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={`http://localhost:8000/extracted_images/${getFileName(selectedImage.file_path)}`}
                                alt={selectedImage.caption || 'Extracted image'}
                                className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
                            />
                            {selectedImage.caption && (
                                <div className="bg-white/10 backdrop-blur-md rounded-xl px-6 py-4 max-w-2xl">
                                    <p className="text-sm text-white/90 leading-relaxed">
                                        {selectedImage.caption}
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default ImageGallery;
