


export const fetchWithBackoff = async (url: string, options: RequestInit, maxRetries = 5): Promise<Response> => {
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