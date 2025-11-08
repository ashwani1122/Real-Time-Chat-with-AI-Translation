
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, query, orderBy, onSnapshot, 
  addDoc, serverTimestamp, getDocs, Firestore, 
  setLogLevel // <-- ADDED: Import setLogLevel for debugging
} from 'firebase/firestore';

// --- Global Context Variables from Canvas Environment ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : { /* Mock Config */ };
const initialAuthToken = typeof __initial_auth_token !== 'undefined' 
  ? __initial_auth_token 
  : null;
// --------------------------------------------------------

// 1. Define TypeScript Interfaces
interface LanguageOption {
    code: string;
    name: string;
}

// Define the type for the timestamp object returned by Firestore
interface FirestoreTimestamp {
    toDate: () => Date;
}



interface TranslatedState {
    text: string;
    language: string;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese (Simplified)' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'ko', name: 'Korean' },
    {code : "hi", name: "Hindi"}

];

/**
 * Executes a fetch request with exponential backoff for resilience.
 */


/**
 * Translates a message using the Gemini API.
 */


// --- Main Application Component ---
const App: React.FC = () => {
    // 2. Type Firebase State explicitly
    const [db, setDb] = useState<Firestore | null>(null);
    const [auth, setAuth] = useState<Auth | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
    
    // 3. Type Chat State explicitly using interfaces
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState<string>('');
    const [targetLanguage, setTargetLanguage] = useState<string>('es'); 

    // UI state for translation and loading
    const [translatedMessages, setTranslatedMessages] = useState<Record<string, TranslatedState>>({});
    const [isTranslating, setIsTranslating] = useState<string | null>(null); // stores messageId being translated

    const scrollRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<HTMLDivElement>(null);

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const app: FirebaseApp = initializeApp(firebaseConfig);
            const firestore: Firestore = getFirestore(app);
            // Set debug log level to diagnose potential connection/auth issues
            setLogLevel('debug'); 
            
            const userAuth: Auth = getAuth(app);
            setDb(firestore);
            setAuth(userAuth);
            
            // Log in using the provided token or anonymously
            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(userAuth, initialAuthToken);
                    } else {
                        await signInAnonymously(userAuth);
                    }
                } catch (e) {
                    console.error("Firebase Auth failed:", e);
                    // Fallback to anonymous if custom token fails
                    await signInAnonymously(userAuth);
                }
            };

            const unsubscribe = onAuthStateChanged(userAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    if (!isAuthReady) {
                        authenticate();
                    } else {
                        // Use a fallback random ID if auth somehow fails later
                        setUserId(userAuth.currentUser?.uid || `anon-${crypto.randomUUID().substring(0, 8)}`);
                        setIsAuthReady(true);
                    }
                }
            });

            if (!initialAuthToken) {
                authenticate();
            }

            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            // Fallback for environment setup failures
            setUserId(`anon-local-${crypto.randomUUID().substring(0, 8)}`);
            setIsAuthReady(true);
        }
    }, []);

    // 2. Real-time Message Listener (onSnapshot)
    useEffect(() => {
        if (!db || !isAuthReady) return;

        const path = `/artifacts/${appId}/public/data/messages`;
        const messagesQuery = query(collection(db, path), orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            const fetchedMessages: ChatMessage[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data() as Omit<ChatMessage, 'id'> // Cast data to the interface
            }));
            setMessages(fetchedMessages);
        }, (error:any) => {
            console.error("Error fetching messages:", error);
        });

        return () => unsubscribe();
    }, [db, isAuthReady]);

    // 3. Auto-Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // 4. Send Message Function - Type the event as React.FormEvent
    const sendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!newMessage.trim() || !db || !userId) return;

        const displayName = `User-${userId.substring(0, 8)}`;
        
        // Ensure the payload structure matches ChatMessage (except for the ID which is dynamic)
        const messagePayload: Omit<ChatMessage, 'id'> = {
            text: newMessage.trim(),
            // serverTimestamp() returns a special object, but its placeholder fits the structure
            timestamp: serverTimestamp() as unknown as FirestoreTimestamp, 
            userId: userId,
            displayName: displayName,
        };

        try {
            const path = `/artifacts/${appId}/public/data/messages`;
            await addDoc(collection(db, path), messagePayload);
            setNewMessage('');
        } catch (error) {
            console.error("Error sending message:", error);
            const systemError: ChatMessage = { 
                id: Date.now().toString(), 
                text: "Failed to send message.", 
                userId: 'System', 
                displayName: 'System',
                timestamp: { toDate: () => new Date() } // Mock timestamp for system message
            };
            setMessages(prev => [...prev, systemError]);
        }
    };

    // 5. Translation Handler - Type the message argument as ChatMessage
    const handleTranslate = useCallback(async (message: ChatMessage) => {
        if (isTranslating === message.id) return;
        
        const targetLang = LANGUAGE_OPTIONS.find((opt: LanguageOption) => opt.code === targetLanguage);
        const targetLangName = targetLang ? targetLang.name : 'English';

        setIsTranslating(message.id);
        setTranslatedMessages(prev => ({ 
            ...prev, 
            [message.id]: { text: 'Translating...', language: targetLangName } 
        }));

        const translatedText = await translateText(message.text, targetLangName);

        setTranslatedMessages(prev => ({ 
            ...prev, 
            [message.id]: { text: translatedText, language: targetLangName } 
        }));
        setIsTranslating(null);
    }, [targetLanguage, isTranslating]);


    // --- UI Components ---
    // 6. Type Message Component Props
   
    

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <div className="flex flex-col items-center">
                    <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-600 font-medium">Connecting to chat...</p>
                    {userId && <p className="text-xs text-gray-400 mt-1">User ID: {userId}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen antialiased bg-gray-50 font-sans">
            <script src="https://cdn.tailwindcss.com"></script>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap'); body { font-family: 'Inter', sans-serif; }`}</style>
            
            <header className="bg-white p-4 shadow-md sticky top-0 z-10">
                <div className="flex justify-between items-center max-w-4xl mx-auto">
                    <h1 className="text-2xl font-extrabold text-blue-600 tracking-tight">
                        Polyglot Chat <span className="text-sm font-normal text-gray-500">({appId.substring(0, 8)})</span>
                    </h1>
                    <div className="flex items-center space-x-3">
                        <label htmlFor="language-select" className="text-sm font-medium text-gray-700 hidden sm:block">
                            Target Language:
                        </label>
                        <select
                            id="language-select"
                            value={targetLanguage}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                                setTargetLanguage(e.target.value);
                                setTranslatedMessages({}); // Clear translations when language changes
                            }}
                            className="p-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 shadow-sm"
                        >
                            {LANGUAGE_OPTIONS.map((lang: LanguageOption) => (
                                <option key={lang.code} value={lang.code}>{lang.name}</option>
                            ))}
                        </select>
                        <span className="text-xs font-mono text-gray-500 p-1 bg-gray-100 rounded">
                            {userId}
                        </span>
                    </div>
                </div>
            </header>

            <main className="flex-grow overflow-hidden max-w-4xl mx-auto w-full">
                <div ref={chatRef} className="h-full overflow-y-auto p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="text-center pt-20 text-gray-500">
                            <p className="mb-2">Start the conversation!</p>
                            <p className="text-xs">Your messages will be saved and visible to others.</p>
                        </div>
                    ) : (
                        messages.map((msg: ChatMessage) => (
                            <Message key={msg.id} message={msg} />
                        ))
                    )}
                    <div ref={scrollRef}></div> {/* Scroll target */}
                </div>
            </main>

            <footer className="bg-white p-4 border-t border-gray-200 sticky bottom-0 z-10">
                <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex space-x-3">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-grow p-3 border border-gray-300 rounded-xl focus:ring-blue-500 focus:border-blue-500 shadow-inner"
                        disabled={!isAuthReady}
                    />
                    <button
                        type="submit"
                        className="p-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition duration-200 shadow-md disabled:bg-blue-400"
                        disabled={!newMessage.trim() || !isAuthReady}
                    >
                        Send
                    </button>
                </form>
            </footer>
        </div>
    );
};

export default App;