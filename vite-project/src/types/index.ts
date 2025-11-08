import type { DocumentData } from "firebase/firestore";

export interface ChatMessage extends DocumentData {
    id: string; // Document ID (populated after fetching)
    text: string;
    userId: string;
    displayName: string;
    // timestamp will be FirestoreTimestamp once written, or null before server fills it
    timestamp: FirestoreTimestamp | null; 
}
export interface MessageProps {
        message: ChatMessage; 
    }
