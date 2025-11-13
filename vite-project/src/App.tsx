import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from "firebase/app";
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged,
  type Auth
} from 'firebase/auth';
import { 
  getFirestore, collection, query, orderBy, onSnapshot, 
  addDoc, serverTimestamp,  Firestore,  
  setLogLevel, // <-- ADDED: Import setLogLevel for debugging
  type DocumentData
} from 'firebase/firestore';

// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCfroGkfuDtKI7dTP_L2JLk2ABUaHPTIP8",
  authDomain: "realtimechattranslation-aae09.firebaseapp.com",
  projectId: "realtimechattranslation-aae09",
  storageBucket: "realtimechattranslation-aae09.firebasestorage.app",
  messagingSenderId: "707301403839",
  appId: "1:707301403839:web:4b94afc418dd45d4d6ea0a",
  measurementId: "G-B3M3ZLPDCH"
};

// // Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);--------------------------------------------------------

// 1. Define TypeScript Interfaces
interface LanguageOption {
    code: string;
    name: string;
}

// Define the type for the timestamp object returned by Firestore
interface FirestoreTimestamp {
    toDate: () => Date;
}

interface ChatMessage extends DocumentData {
    id: string; // Document ID (populated after fetching)
    text: string;
    userId: string;
    displayName: string;
    // timestamp will be FirestoreTimestamp once written, or null before server fills it
    timestamp: FirestoreTimestamp | null; 
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
const fetchWithBackoff = async (url: string, options: RequestInit, maxRetries = 5): Promise<Response> => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorBody = await response.text();
                if (response.status === 400 || response.status === 401 || response.status === 403) {
                    console.error(`Non-retryable API error ${response.status}: ${errorBody}`);
                    throw new Error(`API Error: ${response.status}`);
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i === maxRetries - 1) {
                console.error("Max retries reached. Failing request.", error);
                throw error;
            }
            const delay = Math.pow(2, i) * 1000 + Math.floor(Math.random() * 1000);
            console.warn(`Attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    // This return is required to satisfy TypeScript's Promise<Response>
    throw new Error("Max retries exceeded without successful response.");
};

/**
 * Translates a message using the Gemini API.
 */
const translateText = async (text: string, targetLangName: string): Promise<string> => {
    const apiKey ="AIzaSyAWyVgCc7uTxB_c2rUI3t9nIj9f-nmasQI"
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const systemPrompt = "You are a professional, high-quality language translator. Translate the user's message precisely into the target language provided. Respond only with the translated text, do not add any conversational wrappers or extra text.";
    const userQuery = `Translate this message to ${targetLangName}: "${text}"`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    try {
        const response = await fetchWithBackoff(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const translatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || 
            "Translation failed: API response was empty.";
        return translatedText;
    } catch (error) {
        console.error("Translation API call failed:", error);
        return "Translation failed due to a network or server error.";
    }
};

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
    const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const prevMessageCount = useRef<number>(0);

    // 1. Firebase Initialization and Authentication
    useEffect(() => {
        try {
            const app: FirebaseApp = initializeApp(firebaseConfig);
            const firestore: Firestore = getFirestore(app);
                
                console.log(app)
                console.log("\n")
                console.log(firestore)
  
            setLogLevel('debug'); 
            
            const userAuth: Auth = getAuth(app);
            const initialAuthToken = localStorage.getItem('Authorization');
            setDb(firestore);
            setAuth(userAuth);
            console.log("this is user auth ",userAuth)
            console.log(db)
            // Log in using the provided token or anonymously
            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(userAuth,
                          initialAuthToken
                        );

                    } else {
                        await signInAnonymously(userAuth);
                    }
                } catch (e) {
                    console.error("Firebase Auth failed:", e);
                    // Fallback to anonymous if custom token fails
                    await signInAnonymously(auth !);
                }
            };

            const unsubscribe = onAuthStateChanged(auth!, (user) => {
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

        const path = `/artifacts/${firebaseConfig.appId}/public/data/messages`;
        const messagesQuery = query(collection(db, path), orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            const fetchedMessages: ChatMessage[] = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data() as Omit<ChatMessage, 'id'> // Cast data to the interface
            }));
            setMessages(fetchedMessages);
        }, (error) => {
            console.error("Error fetching messages:", error);
        });

        return () => unsubscribe();
    }, [db, isAuthReady]);

    // 3. Auto-Scroll to bottom
    useEffect(() => {
    if (messages.length > prevMessageCount.current) {
    scrollRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }
  prevMessageCount.current = messages.length;
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
            const path = `/artifacts/${firebaseConfig.appId}/public/data/messages`;
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
   // handleTranslate: preserve scroll position while translating
const handleTranslate = useCallback(async (message: ChatMessage) => {
  if (isTranslating === message.id) return;

  const targetLang = LANGUAGE_OPTIONS.find((opt) => opt.code === targetLanguage);
  const targetLangName = targetLang ? targetLang.name : 'English';

  // preserve current scrollTop
  const chatEl = chatRef.current;
  const prevScrollTop = chatEl ? chatEl.scrollTop : 0;

  setIsTranslating(message.id);
  setTranslatedMessages(prev => ({
    ...prev,
    [message.id]: { text: 'Translating...', language: targetLangName }
  }));

  // run translation
  const translatedText = await translateText(message.text, targetLangName);

  // update translations but restore scroll after DOM updates
  setTranslatedMessages(prev => ({
    ...prev,
    [message.id]: { text: translatedText, language: targetLangName }
  }));
  setIsTranslating(null);

  // Restore scroll position after the DOM paints (use two RAFs to be safe)
  if (chatEl) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          chatEl.scrollTop = prevScrollTop;
        } catch (e) {
          // ignore if element removed or not present
        }
      });
    });
  }
}, [targetLanguage, isTranslating]);


    // --- UI Components ---
    // 6. Type Message Component Props
    interface MessageProps {
        message: ChatMessage;
        messageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
    }

    const Message: React.FC<MessageProps> = ({ message }) => {
        const isMyMessage = message.userId === userId;
        const translation = translatedMessages[message.id];

        // Ensure timestamp is not null before calling toDate()
        const time = message.timestamp?.toDate ? 
            message.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 
            'Sent';

        return (
            <div 
            className={`flex w-full ${isMyMessage ? 'justify-end' : 'justify-start'}`}
            // ✨ FIX: Set the ref for this message's outer container
            ref={el => messageRefs.current[message.id] = el}
        >
                <div className={`p-3 max-w-[80%] my-1 rounded-2xl shadow-lg transition-all duration-300 ease-in-out 
                ${isMyMessage 
                    ? 'bg-blue-700 text-white rounded-br-none' 
                    : 'bg-gray-200 text-gray-800 rounded-tl-none'
                }`}
            >
                    <div className="flex items-baseline justify-between mb-1">
                       {/** <span className={`text-xs font-semibold ${isMyMessage ? 'text-blue-200' : 'text-gray-500'}`}>
                            {message.displayName}
                        </span> */}
                        <span className={`text-[10px] ml-2 ${isMyMessage ? 'text-blue-300' : 'text-gray-400'}`}>
                            {time}
                        </span>
                    </div>
                    <p className="text-sm font-medium whitespace-pre-wrap">{message.text}</p>
                    <button
  type="button" // IMPORTANT: avoid implicit submit behavior
  onMouseDown={(e) => e.preventDefault()} // prevents focusing that may cause scroll
  onClick={() => handleTranslate(message)}
  disabled={isTranslating === message.id}
  className={`mt-2 text-xs font-bold py-1 px-2 rounded-full transition duration-150 ease-in-out
        ${isMyMessage 
            ? 'bg-blue-700 hover:bg-blue-800 text-white' 
            : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
        }`}
>
    {isTranslating === message.id ? (
    <>
    <svg className="animate-spin -ml-1 mr-1 h-3 w-3 inline text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Translating...
    </>
    ) : `Translate to ${LANGUAGE_OPTIONS.find(opt => opt.code === targetLanguage)?.name || 'English'}`}
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


    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <div className="flex flex-col items-center">
                    <svg className="animate-spin h-8 w-8 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-600 font-medium">Connecting to chat...</p>
                    
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
                        Chat Translator
                    </h1>
                    <div className="flex items-center space-x-3">
                        <label htmlFor="language-select" className="text-2xl text-center font-medium text-gray-700 hidden sm:block">
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
                    </div>
                </div>
            </header>

            <main className="flex-grow overflow-hidden max-w-4xl mx-auto w-full">
                <div ref={chatRef} className="h-full overflow-y-scroll p-4 space-y-4">
                    {messages.length === 0 ? (
                        <div className="text-center pt-20 text-gray-500">
                            <p className="mb-2">Start the conversation!</p>
                            <p className="text-xs">Your messages will be saved and visible to others.</p>
                        </div>
                    ) : (
                        messages.map((msg: ChatMessage) => (
                            <Message messageRefs={messageRefs} key={msg.id} message={msg} />
                        ))
                    )}
                    <div ref={scrollRef}></div>
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