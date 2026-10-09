import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEMO_PROFILES, DemoProfileKind } from "@/constants/demoProfiles";

export type Visit = {
    id: string;
    date: Date;
    doctorName: string;
    duration: number;
    audioUri: string;
    transcription: string | null;
    summary: string | null;
    keyPoints: string[];
    diagnoses: string[];
    actions: string[];
    medicalTerms: { term: string; explanation: string }[];
    isProcessing: boolean;
};

export type Citation = {
  id: string;
  sourceTitle: string;
  excerpt: string;
  similarity: number;
  /** Server path e.g. `/uploads/foo.pdf` — join with RAG_API_URL for fetching */
  sourceFilePath?: string;
  assetMongoId?: string;
};

export type Message = {
    id: string;
    text: string;
    isUser: boolean;
    timestamp: Date;
    citations?: Citation[];
};

export type Question = {
    id: string;
    text: string;
    checked: boolean;
};

export type PDFSource = {
    id: string;
    title: string;
    uploadDate: Date;
    fileSize: string;
    status: "processing" | "ready";
};

export type ModuleVideo = {
    id: string;
    title: string;
    description: string;
    duration: string;
    sourceType: "local" | "drive" | "url";
    sourceUri: string;
    thumbnailUri?: string;
    placement: "before_lesson" | "after_intro" | "after_lesson";
};

export type LearningModule = {
    id: string;
    title: string;
    category: string;
    description: string;
    duration: string;
    difficulty: "Beginner" | "Intermediate" | "Advanced";
    progress: number;
    completed: boolean;
    topics: string[];
    video?: ModuleVideo;
};

export type VideoWatchRecord = {
    videoId: string;
    watchedAt: Date;
    completedPercent: number;
};

export type CachedVideo = {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    duration: string;
    category: string;
    order: number;
    cachedAt: Date;
};

type AppContextType = {
    userName: string;
    setUserName: (name: string) => void;
    readingLevel: number;
    setReadingLevel: (level: number) => Promise<void>;
    recordingQuality: "high" | "medium";
    setRecordingQuality: (quality: "high" | "medium") => void;
    autoSave: boolean;
    setAutoSave: (value: boolean) => void;
    isAdmin: boolean;
    setIsAdmin: (value: boolean) => void;
    privacyConsent: boolean;
    setPrivacyConsent: (value: boolean) => Promise<void>;
    privacyConsentDate: Date | null;
    isLoading: boolean;
    onboardingCompleted: boolean;
    completeOnboarding: () => Promise<void>;
    resetOnboarding: () => Promise<void>;
    clearAllData: () => Promise<void>;
    visits: Visit[];
    addVisit: (visit: Visit) => void;
    updateVisit: (id: string, updates: Partial<Visit>) => void;
    deleteVisit: (id: string) => void;
    loadSampleVisits: () => void;
    chatMessages: { [visitId: string]: Message[] };
    addChatMessage: (visitId: string, message: Message) => void;
    plannerQuestions: Question[];
    addPlannerQuestion: (question: Question) => void;
    updatePlannerQuestion: (id: string, updates: Partial<Question>) => void;
    deletePlannerQuestion: (id: string) => void;
    pdfSources: PDFSource[];
    addPDFSource: (source: PDFSource) => void;
    deletePDFSource: (id: string) => void;
    learningModules: LearningModule[];
    setLearningModules: React.Dispatch<React.SetStateAction<LearningModule[]>>;
    updateModuleProgress: (id: string, progress: number) => void;
    completeModule: (id: string) => void;
    educationChatMessages: Message[];
    addEducationChatMessage: (message: Message) => void;
    videoWatchHistory: VideoWatchRecord[];
    addVideoWatchRecord: (record: VideoWatchRecord) => void;
    getVideoWatchProgress: (videoId: string) => number;
    cachedVideos: CachedVideo[];
    setCachedVideos: (videos: CachedVideo[]) => void;
    toggleModuleComplete: (id: string) => void;
    loadDemoProfile: (kind: DemoProfileKind) => Promise<void>
    clearDemoProfile: () => Promise<void>
};

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
    ONBOARDING_COMPLETED: "@InspirEd:onboardingCompleted",
    READING_LEVEL: "@InspirEd:readingLevel",
    VISITS: "@InspirEd:visits",
    CHAT_MESSAGES: "@InspirEd:chatMessages",
    PLANNER_QUESTIONS: "@InspirEd:plannerQuestions",
    PRIVACY_CONSENT: "@InspirEd:privacyConsent",
    PRIVACY_CONSENT_DATE: "@InspirEd:privacyConsentDate",
    VIDEO_WATCH_HISTORY: "@InspirEd:videoWatchHistory",
    CACHED_VIDEOS: "@InspirEd:cachedVideos",
    LEARNING_MODULES: "@InspirEd:learningModules",
    USER_NAME: "@InspirEd:userName",
};

export function AppProvider({ children }: { children: ReactNode }) {
    const [userName, setUserName] = useState("Parent");
    const [readingLevel, setReadingLevel] = useState(8);
    const [recordingQuality, setRecordingQuality] = useState<"high" | "medium">("high");
    const [autoSave, setAutoSave] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [privacyConsent, setPrivacyConsentState] = useState(false);
    const [privacyConsentDate, setPrivacyConsentDate] = useState<Date | null>(null);
    const [onboardingCompleted, setOnboardingCompleted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [chatMessages, setChatMessages] = useState<{ [visitId: string]: Message[] }>({});
    const [plannerQuestions, setPlannerQuestions] = useState<Question[]>([]);
    const [pdfSources, setPDFSources] = useState<PDFSource[]>([]);
    const [educationChatMessages, setEducationChatMessages] = useState<Message[]>([]);
    const [videoWatchHistory, setVideoWatchHistory] = useState<VideoWatchRecord[]>([]);
    const [cachedVideos, setCachedVideosState] = useState<CachedVideo[]>([]);
    const [learningModules, setLearningModules] = useState<LearningModule[]>([
        {
            id: "surfactant-101",
            title: "Understanding Pulmonary Surfactant",
            category: "Fundamentals",
            description: "Learn what surfactant is, how it works, and why it's essential for breathing.",
            duration: "20 min",
            difficulty: "Beginner",
            progress: 0,
            completed: false,
            topics: ["Surfactant", "Alveoli", "Type II Cells", "Surface Tension", "Breathing"],
            video: {
                id: "surfactant-intro-video",
                title: "Your Lungs' Secret Helper",
                description: "A visual guide to understanding how surfactant keeps your lungs working smoothly.",
                duration: "3 min",
                sourceType: "local",
                sourceUri: "attached_assets/Your_Lungs__Secret_Helper_1765463370154.mp4",
                placement: "after_intro",
            },
        },
        {
            id: "1",
            title: "Understanding Pulmonary Function Tests",
            category: "Diagnostics",
            description: "Learn how to read and understand your child's lung function test results.",
            duration: "15 min",
            difficulty: "Beginner",
            progress: 0,
            completed: false,
            topics: ["PFT", "Spirometry", "Test Results", "Normal Ranges"],
        },
        {
            id: "2",
            title: "Managing Daily Medications",
            category: "Treatment",
            description: "Best practices for administering respiratory medications to children.",
            duration: "20 min",
            difficulty: "Beginner",
            progress: 0,
            completed: false,
            topics: ["Inhalers", "Nebulizers", "Medication Schedule", "Side Effects"],
        },
        {
            id: "3",
            title: "Recognizing Warning Signs",
            category: "Emergency",
            description: "Know when to call the doctor and when to seek emergency care.",
            duration: "12 min",
            difficulty: "Beginner",
            progress: 0,
            completed: false,
            topics: ["Symptoms", "Emergency Signs", "When to Call", "Action Plan"],
        },
        {
            id: "4",
            title: "Nutrition for Lung Health",
            category: "Lifestyle",
            description: "Foods and nutrients that support respiratory health in children.",
            duration: "18 min",
            difficulty: "Intermediate",
            progress: 0,
            completed: false,
            topics: ["Nutrition", "Inflammation", "Immune System", "Meal Planning"],
        },
        {
            id: "5",
            title: "Physical Activity Guidelines",
            category: "Lifestyle",
            description: "Safe exercise and activity recommendations for children with pulmonary conditions.",
            duration: "15 min",
            difficulty: "Intermediate",
            progress: 0,
            completed: false,
            topics: ["Exercise", "Sports", "Safety", "Benefits"],
        },
        {
            id: "6",
            title: "Advanced Treatment Options",
            category: "Treatment",
            description: "Explore newer therapies and clinical trial opportunities.",
            duration: "25 min",
            difficulty: "Advanced",
            progress: 0,
            completed: false,
            topics: ["Clinical Trials", "New Therapies", "Research", "Specialists"],
        },
    ]);

    const addVisit = (visit: Visit) => {
        setVisits((prev) => {
            const newVisits = [visit, ...prev];
            AsyncStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(newVisits)).catch((error) =>
                console.error("Error saving visit:", error)
            );
            return newVisits;
        });
    };

    const updateVisit = (id: string, updates: Partial<Visit>) => {
        setVisits((prev) => {
            const updatedVisits = prev.map((visit) =>
                visit.id === id ? { ...visit, ...updates } : visit
            );
            AsyncStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(updatedVisits)).catch((error) =>
                console.error("Error updating visit:", error)
            );
            return updatedVisits;
        });
    };

    const deleteVisit = (id: string) => {
        setVisits((prev) => {
            const filteredVisits = prev.filter((visit) => visit.id !== id);
            AsyncStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(filteredVisits)).catch((error) =>
                console.error("Error deleting visit:", error)
            );
            return filteredVisits;
        });
        setChatMessages((prev) => {
            const { [id]: _, ...rest } = prev;
            AsyncStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(rest)).catch((error) =>
                console.error("Error deleting chat messages:", error)
            );
            return rest;
        });
    };

    const loadSampleVisits = () => {
        const sampleVisits: Visit[] = [
            {
                id: "sample-1",
                date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                doctorName: "Smith",
                duration: 1245,
                audioUri: "",
                transcription: "Doctor: Good morning! How has Emma been doing since our last visit? Parent: She's been doing much better with her breathing exercises. We've been using the spacer with her inhaler twice daily as you recommended. Doctor: That's great to hear. Let me listen to her lungs... Her airways sound much clearer today. I'm pleased with her progress. Parent: We did notice she had some wheezing last week during the cold snap. Doctor: That's common with temperature changes. Let's discuss some strategies to manage that.",
                summary: "Emma is making good progress with her breathing exercises and inhaler use. Her lungs sound clearer. Some wheezing occurred during cold weather, which is normal. The doctor will provide strategies for managing symptoms during temperature changes.",
                keyPoints: [
                    "Breathing exercises are helping",
                    "Continue spacer with inhaler twice daily",
                    "Lungs sound clearer than before",
                    "Cold weather can trigger wheezing",
                ],
                diagnoses: ["Pediatric asthma - well controlled"],
                actions: [
                    "Continue current medication routine",
                    "Use rescue inhaler before outdoor activities in cold weather",
                    "Follow up in 3 months",
                ],
                medicalTerms: [
                    { term: "Spacer", explanation: "A tube that attaches to an inhaler to help deliver medicine more effectively to the lungs" },
                    { term: "Wheezing", explanation: "A whistling sound when breathing, often caused by narrowed airways" },
                ],
                isProcessing: false,
            },
            {
                id: "sample-2",
                date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                doctorName: "Johnson",
                duration: 1820,
                audioUri: "",
                transcription: "Doctor: I've reviewed Emma's latest pulmonary function test results. Parent: How did she do? Doctor: Her FEV1 is at 85% of predicted, which is an improvement from 78% last time. This is really encouraging. Parent: That's wonderful news! We've been very consistent with her treatments. Doctor: It shows. I'd like to discuss adjusting her maintenance medication since she's doing so well.",
                summary: "Emma's lung function test shows improvement - FEV1 increased from 78% to 85%. The consistent treatment routine is working well. The doctor may adjust maintenance medications based on this progress.",
                keyPoints: [
                    "FEV1 improved from 78% to 85%",
                    "Pulmonary function test shows positive trend",
                    "Consistent treatment is paying off",
                    "May reduce maintenance medication",
                ],
                diagnoses: ["Pediatric asthma - improving"],
                actions: [
                    "Discuss medication adjustment at next visit",
                    "Continue current routine until then",
                    "Schedule follow-up pulmonary function test in 6 months",
                ],
                medicalTerms: [
                    { term: "FEV1", explanation: "Forced Expiratory Volume in 1 second - measures how much air you can forcefully breathe out in one second" },
                    { term: "Pulmonary function test", explanation: "A breathing test that measures how well the lungs are working" },
                ],
                isProcessing: false,
            },
        ];
        setVisits(sampleVisits);
        AsyncStorage.setItem(STORAGE_KEYS.VISITS, JSON.stringify(sampleVisits)).catch((error) =>
            console.error("Error saving sample visits:", error)
        );
    };

    const addChatMessage = (visitId: string, message: Message) => {
        setChatMessages((prev) => {
            const newMessages = {
                ...prev,
                [visitId]: [...(prev[visitId] || []), message],
            };
            AsyncStorage.setItem(STORAGE_KEYS.CHAT_MESSAGES, JSON.stringify(newMessages)).catch(
                (error) => console.error("Error saving chat message:", error)
            );
            return newMessages;
        });
    };

    const addPlannerQuestion = (question: Question) => {
        setPlannerQuestions((prev) => {
            const newQuestions = [...prev, question];
            AsyncStorage.setItem(STORAGE_KEYS.PLANNER_QUESTIONS, JSON.stringify(newQuestions)).catch(
                (error) => console.error("Error saving planner question:", error)
            );
            return newQuestions;
        });
    };

    const updatePlannerQuestion = (id: string, updates: Partial<Question>) => {
        setPlannerQuestions((prev) => {
            const updatedQuestions = prev.map((q) => (q.id === id ? { ...q, ...updates } : q));
            AsyncStorage.setItem(STORAGE_KEYS.PLANNER_QUESTIONS, JSON.stringify(updatedQuestions)).catch(
                (error) => console.error("Error updating planner question:", error)
            );
            return updatedQuestions;
        });
    };

    const deletePlannerQuestion = (id: string) => {
        setPlannerQuestions((prev) => {
            const filteredQuestions = prev.filter((q) => q.id !== id);
            AsyncStorage.setItem(STORAGE_KEYS.PLANNER_QUESTIONS, JSON.stringify(filteredQuestions)).catch(
                (error) => console.error("Error deleting planner question:", error)
            );
            return filteredQuestions;
        });
    };

    const addPDFSource = (source: PDFSource) => {
        setPDFSources((prev) => [source, ...prev]);
    };

    const deletePDFSource = (id: string) => {
        setPDFSources((prev) => prev.filter((s) => s.id !== id));
    };

    const updateModuleProgress = (id: string, progress: number) => {
        setLearningModules((prev) =>
            prev.map((module) =>
                module.id === id ? { ...module, progress, completed: progress >= 100 } : module
            )
        );
    };

    const completeModule = (id: string) => {
        setLearningModules((prev) =>
            prev.map((module) => (module.id === id ? { ...module, progress: 100, completed: true } : module))
        );
    };

    const toggleModuleComplete = (id: string) => {
        setLearningModules((prev) => {
            const updated = prev.map((module) =>
                module.id === id
                    ? {
                        ...module,
                        completed: !module.completed,
                        progress: !module.completed ? 100 : 0,
                    }
                    : module
            );

            AsyncStorage.setItem(
                STORAGE_KEYS.LEARNING_MODULES,
                JSON.stringify(updated)
            ).catch((error) =>
                console.error("Error saving learning modules:", error)
            );

            return updated;
        });
    };

    const addEducationChatMessage = (message: Message) => {
        setEducationChatMessages((prev) => [...prev, message]);
    };

    const addVideoWatchRecord = (record: VideoWatchRecord) => {
        setVideoWatchHistory((prev) => {
            const existingIndex = prev.findIndex((r) => r.videoId === record.videoId);
            let newHistory;
            if (existingIndex >= 0) {
                newHistory = [...prev];
                if (record.completedPercent > newHistory[existingIndex].completedPercent) {
                    newHistory[existingIndex] = record;
                } else {
                    newHistory[existingIndex] = { ...newHistory[existingIndex], watchedAt: record.watchedAt };
                }
            } else {
                newHistory = [...prev, record];
            }
            AsyncStorage.setItem(STORAGE_KEYS.VIDEO_WATCH_HISTORY, JSON.stringify(newHistory)).catch(
                (error) => console.error("Error saving video watch history:", error)
            );
            return newHistory;
        });
    };

    const getVideoWatchProgress = (videoId: string): number => {
        const record = videoWatchHistory.find((r) => r.videoId === videoId);
        return record?.completedPercent || 0;
    };

    const setCachedVideos = (videos: CachedVideo[]) => {
        setCachedVideosState(videos);
        AsyncStorage.setItem(STORAGE_KEYS.CACHED_VIDEOS, JSON.stringify(videos)).catch(
            (error) => console.error("Error saving cached videos:", error)
        );
    };

    const completeOnboarding = async () => {
        setOnboardingCompleted(true);
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, "true");
        } catch (error) {
            console.error("Error saving onboarding completion:", error);
            throw error;
        }
    };

    const resetOnboarding = async () => {
        setOnboardingCompleted(false);
        try {
            await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETED);
        } catch (error) {
            console.error("Error resetting onboarding:", error);
            throw error;
        }
    };

    const setPrivacyConsent = async (value: boolean) => {
        setPrivacyConsentState(value);
        try {
            if (value) {
                const now = new Date();
                setPrivacyConsentDate(now);
                await AsyncStorage.setItem(STORAGE_KEYS.PRIVACY_CONSENT, "true");
                await AsyncStorage.setItem(STORAGE_KEYS.PRIVACY_CONSENT_DATE, now.toISOString());
            } else {
                setPrivacyConsentDate(null);
                await AsyncStorage.multiRemove([
                    STORAGE_KEYS.PRIVACY_CONSENT,
                    STORAGE_KEYS.PRIVACY_CONSENT_DATE,
                ]);
            }
        } catch (error) {
            console.error("Error saving privacy consent:", error);
            throw error;
        }
    };

    const clearAllData = async () => {
        try {
            await AsyncStorage.multiRemove([
                STORAGE_KEYS.VISITS,
                STORAGE_KEYS.CHAT_MESSAGES,
                STORAGE_KEYS.PLANNER_QUESTIONS,
                STORAGE_KEYS.PRIVACY_CONSENT,
                STORAGE_KEYS.PRIVACY_CONSENT_DATE,
                STORAGE_KEYS.VIDEO_WATCH_HISTORY,
                STORAGE_KEYS.CACHED_VIDEOS,
            ]);
            setVisits([]);
            setChatMessages({});
            setPlannerQuestions([]);
            setEducationChatMessages([]);
            setPrivacyConsentState(false);
            setPrivacyConsentDate(null);
            setVideoWatchHistory([]);
            setCachedVideosState([]);
            setLearningModules((prev) =>
                prev.map((module) => ({ ...module, progress: 0, completed: false }))
            );
        } catch (error) {
            console.error("Error clearing all data:", error);
            throw error;
        }
    };

    const updateReadingLevel = async (level: number) => {
        setReadingLevel(level);
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.READING_LEVEL, level.toString());
        } catch (error) {
            console.error("Error saving reading level:", error);
            throw error;
        }
    };

    // Inside AppProvider:
    const loadDemoProfile = async (kind: DemoProfileKind) => {
        await clearAllData();                        // start from a clean slate
        const profile = DEMO_PROFILES[kind];
        setUserName(profile.name);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, profile.name);
        await updateReadingLevel(profile.readingLevel);
        await setPrivacyConsent(true);
        await completeOnboarding();
        loadSampleVisits();
    };

    const clearDemoProfile = async () => {
        await clearAllData();
        await AsyncStorage.multiRemove([STORAGE_KEYS.READING_LEVEL, STORAGE_KEYS.USER_NAME]);
        setUserName("Parent");
        setReadingLevel(8);
        await resetOnboarding();                     // back to first-launch state
    };

    useEffect(() => {
        const loadStoredData = async () => {
            try {
                const [storedOnboarding, storedLevel, storedVisits, storedChatMessages, storedQuestions, storedConsent, storedConsentDate, storedVideoHistory, storedCachedVideos, storedModules, storedUserName] =
                    await Promise.all([
                        AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED),
                        AsyncStorage.getItem(STORAGE_KEYS.READING_LEVEL),
                        AsyncStorage.getItem(STORAGE_KEYS.VISITS),
                        AsyncStorage.getItem(STORAGE_KEYS.CHAT_MESSAGES),
                        AsyncStorage.getItem(STORAGE_KEYS.PLANNER_QUESTIONS),
                        AsyncStorage.getItem(STORAGE_KEYS.PRIVACY_CONSENT),
                        AsyncStorage.getItem(STORAGE_KEYS.PRIVACY_CONSENT_DATE),
                        AsyncStorage.getItem(STORAGE_KEYS.VIDEO_WATCH_HISTORY),
                        AsyncStorage.getItem(STORAGE_KEYS.CACHED_VIDEOS),
                        AsyncStorage.getItem(STORAGE_KEYS.LEARNING_MODULES),
                        AsyncStorage.getItem(STORAGE_KEYS.USER_NAME),
                    ]);

                if (storedOnboarding === "true") {
                    setOnboardingCompleted(true);
                }

                if (storedLevel) {
                    setReadingLevel(parseInt(storedLevel, 10));
                }

                if (storedConsent === "true") {
                    setPrivacyConsentState(true);
                }

                if (storedConsentDate) {
                    setPrivacyConsentDate(new Date(storedConsentDate));
                }

                if (storedVisits) {
                    const parsedVisits = JSON.parse(storedVisits);
                    const visitsWithDates = parsedVisits.map((visit: any) => ({
                        ...visit,
                        date: new Date(visit.date),
                        transcription: visit.transcription ?? null,
                    }));
                    setVisits(visitsWithDates);
                }

                if (storedChatMessages) {
                    const parsedMessages = JSON.parse(storedChatMessages);
                    const messagesWithDates: { [key: string]: Message[] } = {};
                    for (const [visitId, messages] of Object.entries(parsedMessages)) {
                        messagesWithDates[visitId] = (messages as any[]).map((msg) => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp),
                        }));
                    }
                    setChatMessages(messagesWithDates);
                }

                if (storedQuestions) {
                    setPlannerQuestions(JSON.parse(storedQuestions));
                }

                if (storedVideoHistory) {
                    const parsedHistory = JSON.parse(storedVideoHistory);
                    const historyWithDates = parsedHistory.map((record: any) => ({
                        ...record,
                        watchedAt: new Date(record.watchedAt),
                    }));
                    setVideoWatchHistory(historyWithDates);
                }

                if (storedCachedVideos) {
                    const parsedVideos = JSON.parse(storedCachedVideos);
                    const videosWithDates = parsedVideos.map((video: any) => ({
                        ...video,
                        cachedAt: new Date(video.cachedAt),
                    }));
                    setCachedVideosState(videosWithDates);
                }
                if (storedModules) {
                    setLearningModules(JSON.parse(storedModules));
                }

            } catch (error) {
                console.error("Error loading stored data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadStoredData();
    }, []);

    return (
        <AppContext.Provider
            value={{
                userName,
                setUserName,
                readingLevel,
                setReadingLevel: updateReadingLevel,
                recordingQuality,
                setRecordingQuality,
                autoSave,
                setAutoSave,
                isAdmin,
                setIsAdmin,
                privacyConsent,
                setPrivacyConsent,
                privacyConsentDate,
                isLoading,
                onboardingCompleted,
                completeOnboarding,
                resetOnboarding,
                clearAllData,
                visits,
                addVisit,
                updateVisit,
                deleteVisit,
                loadSampleVisits,
                chatMessages,
                addChatMessage,
                plannerQuestions,
                addPlannerQuestion,
                updatePlannerQuestion,
                deletePlannerQuestion,
                pdfSources,
                addPDFSource,
                deletePDFSource,
                learningModules,
                setLearningModules,
                updateModuleProgress,
                completeModule,
                educationChatMessages,
                addEducationChatMessage,
                videoWatchHistory,
                addVideoWatchRecord,
                getVideoWatchProgress,
                cachedVideos,
                setCachedVideos,
                toggleModuleComplete,
                loadDemoProfile,
                clearDemoProfile,
            }}
        >
            {children}
        </AppContext.Provider>
    );
}

export function useAppContext() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useAppContext must be used within AppProvider");
    }
    return context;
}
