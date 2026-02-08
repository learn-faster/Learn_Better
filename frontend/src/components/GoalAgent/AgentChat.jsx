import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Settings as SettingsIcon, Loader2, ChevronDown, ChevronUp, Sparkles, Brain, Copy, Check, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

/**
 * Parses agent response to extract thinking and main content.
 * @param {string} content - The raw agent response.
 * @returns {{ thinking: string | null, response: string }}
 */
const parseAgentResponse = (content) => {
    if (!content) return { thinking: null, response: '' };

    // Match <think>...</think> or **Thinking:**...
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);

    if (thinkMatch) {
        const thinking = thinkMatch[1].trim();
        const response = content.replace(thinkMatch[0], '').trim();
        return { thinking, response };
    }

    return { thinking: null, response: content };
};

/**
 * Typing indicator with animated dots.
 */
const TypingIndicator = () => (
    <div className="flex items-center gap-1 px-3 py-2">
        <motion.span
            className="w-2 h-2 bg-indigo-400 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0 }}
        />
        <motion.span
            className="w-2 h-2 bg-indigo-400 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
        />
        <motion.span
            className="w-2 h-2 bg-indigo-400 rounded-full"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
        />
    </div>
);

/**
 * Individual message bubble component.
 */
const MessageBubble = ({ message, isUser }) => {
    const [showThinking, setShowThinking] = useState(false);
    const [copied, setCopied] = useState(false);

    const { thinking, response } = isUser
        ? { thinking: null, response: message.content }
        : parseAgentResponse(message.content);

    const handleCopy = () => {
        navigator.clipboard.writeText(response);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
        >
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                }`}>
                {isUser ? <User size={14} /> : <Bot size={14} />}
            </div>

            {/* Content */}
            <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Thinking Section (for AI responses only) */}
                {thinking && (
                    <button
                        onClick={() => setShowThinking(!showThinking)}
                        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mb-1.5 transition-colors"
                    >
                        <Brain size={12} />
                        <span>View reasoning</span>
                        <ChevronDown size={12} className={`transition-transform ${showThinking ? 'rotate-180' : ''}`} />
                    </button>
                )}

                <AnimatePresence>
                    {showThinking && thinking && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/80 overflow-hidden"
                        >
                            <div className="flex items-center gap-1.5 text-amber-400 font-medium mb-1">
                                <Brain size={12} />
                                <span>Thinking</span>
                            </div>
                            <p className="whitespace-pre-wrap">{thinking}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Message Bubble */}
                <div className={`relative rounded-2xl px-4 py-3 shadow-lg ${isUser
                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white'
                        : 'bg-dark-800/80 border border-white/10 text-gray-100'
                    }`}>
                    <div className={`prose prose-sm max-w-none ${isUser ? 'prose-invert' : 'prose-invert prose-p:text-gray-200'
                        } prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5`}>
                        <ReactMarkdown>{response}</ReactMarkdown>
                    </div>

                    {/* Actions (only for AI messages) */}
                    {!isUser && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={handleCopy}
                                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Copy response"
                            >
                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

const AgentChat = ({ onSettingsClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: '👋 Hey! I\'m your Goal Manifestation Agent. Tell me what you\'d like to achieve, and I\'ll help you get there!' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            inputRef.current?.focus();
        }
    }, [messages, isOpen]);

    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const data = await api.post('/goals/agent/chat', { message: userMsg.content });
            const agentMsg = { role: 'assistant', content: data.message };
            setMessages(prev => [...prev, agentMsg]);
        } catch (error) {
            console.error('Error fetching agent response:', error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '❌ Sorry, I encountered an error. Please check your settings and try again.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const clearChat = () => {
        setMessages([
            { role: 'assistant', content: '👋 Chat cleared! How can I help you achieve your goals today?' }
        ]);
    };

    return (
        <div className={`transition-all duration-300 ease-out ${isOpen ? 'h-[600px]' : 'h-14'} w-full max-w-2xl bg-dark-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col`}>
            {/* Header */}
            <div
                className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 cursor-pointer h-14 shrink-0"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-white text-sm">Goal Agent</h2>
                        {!isOpen && <p className="text-[10px] text-white/70">Click to chat</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            clearChat();
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
                        title="Clear chat"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSettingsClick();
                        }}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
                        title="Agent Settings"
                    >
                        <SettingsIcon className="w-4 h-4" />
                    </button>
                    <div className="p-1 text-white/70">
                        {isOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 flex flex-col min-h-0"
                    >
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {messages.map((msg, idx) => (
                                <MessageBubble
                                    key={idx}
                                    message={msg}
                                    isUser={msg.role === 'user'}
                                />
                            ))}
                            {isLoading && (
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-lg">
                                        <Bot size={14} className="text-white" />
                                    </div>
                                    <div className="bg-dark-800/80 rounded-2xl border border-white/10">
                                        <TypingIndicator />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-dark-950/50 border-t border-white/5">
                            <div className="relative">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyPress}
                                    placeholder="Message Goal Agent..."
                                    className="w-full pl-4 pr-14 py-3.5 rounded-xl bg-dark-800/80 border border-white/10 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 text-white placeholder:text-gray-500 transition-all resize-none h-[52px] max-h-32 text-sm"
                                    rows={1}
                                />
                                <button
                                    onClick={sendMessage}
                                    disabled={!input.trim() || isLoading}
                                    className="absolute right-2 top-2 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/30"
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                            <div className="mt-2 text-[10px] text-center text-gray-500">
                                Agent can access: Memory • Goals • Screenshots • Email
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AgentChat;
