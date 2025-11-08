import { fetchWithBackoff } from "../backoff/backoff";

export const translateText = async (text: string, targetLangName: string): Promise<string> => {
    const apiKey = ""; 
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