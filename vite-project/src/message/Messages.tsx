import React, { useState } from 'react';
import { Message as MessageType, TranslatedMessage } from '../types';
import { LANGUAGE_OPTIONS, translateMessage } from '../utils/translation';
import { useAuth } from '../contexts/AuthContext';

const Message: React.FC<MessageProps> = ({ message }) => {
        const isMyMessage = message.userId === userId;
        const translation = translatedMessages[message.id];

        // Ensure timestamp is not null before calling toDate()
        const time = message.timestamp?.toDate ? 
            message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
            'Sending...';

        return (
            <div className={`flex w-full ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 max-w-[80%] my-1 rounded-2xl shadow-lg transition-all duration-300 ease-in-out 
                    ${isMyMessage 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-gray-200 text-gray-800 rounded-tl-none'
                    }`}
                >
                    <div className="flex items-baseline justify-between mb-1">
                        <span className={`text-xs font-semibold ${isMyMessage ? 'text-blue-200' : 'text-gray-500'}`}>
                            {message.displayName}
                        </span>
                        <span className={`text-[10px] ml-2 ${isMyMessage ? 'text-blue-300' : 'text-gray-400'}`}>
                            {time}
                        </span>
                    </div>

                    <p className="text-sm font-medium whitespace-pre-wrap">{message.text}</p>
                    
                    {/* Translation UI */}
                    <button
                        onClick={() => handleTranslate(message)}
                        disabled={isTranslating === message.id}
                        className={`mt-2 text-xs font-bold py-1 px-2 rounded-full transition duration-150 ease-in-out
                            ${isMyMessage 
                                ? 'bg-blue-700 hover:bg-blue-800 text-white' 
                                : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                            }`}
                    >
                        {isTranslating === message.id 
                            ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-1 h-3 w-3 inline text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Translating...
                                </>
                            )
                            : `Translate to ${LANGUAGE_OPTIONS.find(opt => opt.code === targetLanguage)?.name || 'English'}`
                        }
                    </button>

                    {translation && (
                        <div className="mt-2 pt-2 border-t border-opacity-30 border-current">
                            <p className="text-xs italic opacity-90">
                                <span className="font-semibold">{translation.language} Translation: </span>
                                {translation.text}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };
