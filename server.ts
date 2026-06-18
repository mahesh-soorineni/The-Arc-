/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

// Lazy initialization of the Gemini Client for safe startup
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not defined. Gemini calls will fail until configured.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload size limit to accept images & scanned PDFs
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));

  // API router / endpoints
  app.post('/api/gemini/parse-timetable', async (req, res) => {
    try {
      const { fileData, mimeType } = req.body;

      if (!fileData || !mimeType) {
        return res.status(400).json({ error: 'Missing fileData or mimeType parameters' });
      }

      const prompt = `Analyze this uploaded document/image of a college timetable or syllabus. 
Your task is to detect the college name, degree, branch, semester/session, and extract all subjects (especially identifying any experimental lab sessions vs theoretical lectures) along with the weekly class schedule slots.

Guidelines:
1. Extract "collegeName" (e.g., "K.S.R.M. College of Engineering"), "degree" (e.g., "B.Tech"), "branch" (e.g., "Computer Science & Engineering"), "semester" (e.g., "Semester VI").
2. Extract all distinct "subjects". Each subject should contain:
   - "code": A short, uppercase code (e.g., "DBMS", "OS_LAB")
   - "name": The descriptive name of the module/course
   - "isLab": A boolean flag indicating if this is a practical lab, workshop, or project session rather than a regular lecture.
   - "labHours": If isLab is true, identify how many hours are typically assigned to this lab session per class (usually 2, 3, or 4 hours).
3. Extract "timetableSlots" indicating which subjects are scheduled for each day of the week.
   - Key names should correspond to weekday indexes matching Javascript system bounds:
     "1" for Monday, "2" for Tuesday, "3" for Wednesday, "4" for Thursday, "5" for Friday, "6" for Saturday, "0" for Sunday.
   - Array items should contain "subjectCode" and "hours" (how many contiguous hours of classes are scheduled for that subject on that specific weekday).
4. If a piece of info is missing, make a highly calculated, intelligent estimate based on context clues in the document, or use standard defaults. Never return empty structures.
5. All subjectCode fields inside "timetableSlots" MUST match one of the codes parsed in the "subjects" array exactly.

Execute processing precisely.`;

      const response = await getGeminiClient().models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: mimeType,
              data: fileData
            }
          }
        ],
        config: {
          systemInstruction: prompt,
          temperature: 0.1,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              collegeName: { type: Type.STRING, description: 'The name of the college or university.' },
              degree: { type: Type.STRING, description: 'The degree program name (e.g. B.Tech, M.Tech, B.Sc).' },
              branch: { type: Type.STRING, description: 'The engineering branch or major stream.' },
              semester: { type: Type.STRING, description: 'The specific semester or term term (e.g. Semester VI, Semester III).' },
              subjects: {
                type: Type.ARRAY,
                description: 'List of all subjects identified in the timetable/document.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    code: { type: Type.STRING, description: 'Uppercase short unique identifier code for the subject (e.g. DBMS, ME, OS).' },
                    name: { type: Type.STRING, description: 'The full human-readable name of the course.' },
                    isLab: { type: Type.BOOLEAN, description: 'Is this subject a laboratory or practical class?' },
                    labHours: { type: Type.INTEGER, description: 'Number of hours for this lab class, or null.' }
                  },
                  required: ['code', 'name', 'isLab']
                }
              },
              timetableSlots: {
                type: Type.OBJECT,
                description: 'Record mapping weekday string indices ("1"-"6", "0") to arrays of scheduled TimetableSlots.',
                properties: {
                  '1': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  },
                  '2': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  },
                  '3': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  },
                  '4': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  },
                  '5': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  },
                  '6': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  },
                  '0': {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subjectCode: { type: Type.STRING, description: 'The subject code.' },
                        hours: { type: Type.INTEGER, description: 'The duration of this class in hours.' }
                      },
                      required: ['subjectCode', 'hours']
                    }
                  }
                },
                required: ['1', '2', '3', '4', '5', '6', '0']
              }
            },
            required: ['collegeName', 'degree', 'branch', 'semester', 'subjects', 'timetableSlots']
          }
        }
      });

      const cleanJson = response.text?.trim() || '{}';
      res.json(JSON.parse(cleanJson));
    } catch (error: any) {
      console.error('Failed to parse timetable via Gemini error:', error);
      res.status(500).json({ error: error.message || 'Server failed to analyze the document.' });
    }
  });

  // Serve static assets in production, or mount Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer();
