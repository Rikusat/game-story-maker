<<<<<<< Updated upstream
import OpenAI from "openai";
=======
git log --oneline -5import OpenAI from "openai";

>>>>>>> Stashed changes
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
