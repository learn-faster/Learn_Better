import React, { useEffect, useState } from 'react';
import {
    Plus,
    Search,
    Trash2,
    Edit3,
    Bookmark,
    Filter,
    BrainCircuit,
    Calendar
} from 'lucide-react';
import useFlashcardStore from '../stores/useFlashcardStore';
import Card from '../components/ui/Card';
import FlashcardCreator from '../components/flashcards/FlashcardCreator';

/**
 * Flashcards Page Component.
 * 
 * Manages the library of study flashcards.
 * Provides tools for:
 * - Viewing all generated and manual flashcards.
 * - Searching cards by front/back content or tags.
 * - Quick-creating new cards via the integrated creator.
 * - Deleting unwanted cards.
 * 
 * @returns {JSX.Element} The rendered flashcard library page.
 */
const Flashcards = () => {
    const { flashcards, isLoading, fetchFlashcards, deleteFlashcard } = useFlashcardStore();
    const [isCreatorOpen, setIsCreatorOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchFlashcards();
    }, [fetchFlashcards]);

    /**
     * Filters the card deck based on the user's search query across front, back, and tags.
     */
    const filteredCards = flashcards.filter(card =>
        card.front.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.back.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                    <input
                        type="text"
                        placeholder="Search cards..."
                        className="w-full pl-10 h-10 glass-light border-white/10 rounded-xl focus:border-primary-500/50"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button
                    onClick={() => setIsCreatorOpen(!isCreatorOpen)}
                    className="btn-primary"
                >
                    {isCreatorOpen ? 'Close Creator' : (
                        <>
                            <Plus className="w-5 h-5" />
                            New Card
                        </>
                    )}
                </button>
            </div>

            {/* In-place Study Card Creator */}
            {isCreatorOpen && (
                <Card title="Quick Create" className="border-primary-500/20 shadow-primary-500/10 shadow-2xl">
                    <FlashcardCreator onComplete={() => setIsCreatorOpen(false)} />
                </Card>
            )}

            {/* Flashcard Grid Representation */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-40 rounded-2xl animate-pulse bg-white/5" />
                    ))}
                </div>
            ) : filteredCards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredCards.map((card) => (
                        <Card key={card.id} className="group relative overflow-hidden transition-all hover:border-primary-500/30">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                        <BrainCircuit className="w-4 h-4 text-primary-400" />
                                        <span className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Question</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-4 line-clamp-2 leading-snug">
                                        {card.front}
                                    </h3>

                                    <div className="flex flex-wrap gap-2 mb-1">
                                        {card.tags.map(tag => (
                                            <span key={tag} className="px-2 py-0.5 bg-white/5 rounded text-[10px] font-bold text-dark-400 uppercase tracking-tighter">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => deleteFlashcard(card.id)}
                                        className="p-2 text-dark-500 hover:text-red-400 transition-colors bg-white/5 rounded-lg border border-white/5"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                                <div className="flex items-center gap-2 text-dark-500">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Due: {new Date(card.next_review).toLocaleDateString()}
                                </div>
                                <div className="flex items-center gap-2 text-primary-400 bg-primary-500/10 px-2 py-1 rounded">
                                    EF {card.ease_factor.toFixed(1)}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-white/5 rounded-2xl border-2 border-dashed border-white/5">
                    <BrainCircuit className="w-16 h-16 text-dark-700 mx-auto mb-4 opacity-20" />
                    <h3 className="text-xl font-bold text-dark-300">No flashcards found</h3>
                    <p className="text-dark-500 mt-2">Start creating cards from your documents or add them manually!</p>
                    <button
                        onClick={() => setIsCreatorOpen(true)}
                        className="btn-primary mx-auto mt-6"
                    >
                        <Plus className="w-5 h-5" />
                        Create Your First Card
                    </button>
                </div>
            )}
        </div>
    );
};

export default Flashcards;
