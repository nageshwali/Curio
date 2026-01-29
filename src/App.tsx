import { useState, useEffect, useRef, useCallback, memo } from 'react';

// ============ TYPES ============
interface CurioItem {
  id: string;
  title: string;
  subtext: string;
  image_url?: string;
  imageUrl?: string;
  badges: string[];
  collection: string;
  summary: string;
  anomaly: string;
  known_facts: string[];
  unknowns: string[];
  myths: string[];
  evidence_tier: 'verified' | 'strong' | 'emerging' | 'theoretical' | 'debated';
  language?: string;
}

type AppLanguage = 'en' | 'hi' | 'kn';
type ViewMode = 'feed' | 'saved';

// ============ CONSTANTS ============
const STORAGE_KEYS = {
  APP_LANG: 'curio_app_lang_v1',
  CONTENT_LANG: 'curio_content_lang_v1',
  FIRST_OPEN: 'curio_first_open_v1',
  SAVED: 'curio_saved_v1',
  IMPORTED: 'curio_imported_v1',
  SOUND: 'curio_sound_v1',
  IMAGE_CACHE: 'curio_img_cache_v13',
} as const;

// Gradient patterns for fallback
const GRADIENT_PATTERNS = [
  'from-amber-900 via-orange-800 to-red-900',
  'from-blue-900 via-indigo-800 to-purple-900',
  'from-emerald-900 via-teal-800 to-cyan-900',
  'from-rose-900 via-pink-800 to-fuchsia-900',
  'from-violet-900 via-purple-800 to-indigo-900',
  'from-cyan-900 via-blue-800 to-indigo-900',
  'from-orange-900 via-red-800 to-rose-900',
  'from-teal-900 via-emerald-800 to-green-900',
  'from-fuchsia-900 via-pink-800 to-rose-900',
  'from-indigo-900 via-blue-800 to-cyan-900',
  'from-yellow-900 via-amber-800 to-orange-900',
  'from-green-900 via-emerald-800 to-teal-900',
];

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

function getGradientForItem(itemId: string): string {
  const index = hashString(itemId) % GRADIENT_PATTERNS.length;
  return GRADIENT_PATTERNS[index];
}

// ============ IMAGE CACHE ============
const imageCache: Record<string, string> = {};

try {
  const stored = localStorage.getItem(STORAGE_KEYS.IMAGE_CACHE);
  if (stored) {
    Object.assign(imageCache, JSON.parse(stored));
  }
} catch {}

function saveImageCache() {
  try {
    localStorage.setItem(STORAGE_KEYS.IMAGE_CACHE, JSON.stringify(imageCache));
  } catch {}
}

function getCachedImage(itemId: string): string | null {
  return imageCache[itemId] || null;
}

function setCachedImage(itemId: string, url: string) {
  imageCache[itemId] = url;
  saveImageCache();
}

// ============ WIKIMEDIA API IMAGE FETCHER ============
function extractFilename(url: string): string {
  if (!url) return '';
  try {
    let decoded = decodeURIComponent(url);
    let filename = decoded.split('/').pop() || '';
    filename = filename.split('?')[0];
    filename = filename.replace(/^File:/i, '').replace(/^Image:/i, '');
    return filename;
  } catch {
    return '';
  }
}

async function fetchWikimediaImageUrl(filename: string): Promise<string | null> {
  if (!filename) return null;
  try {
    const title = `File:${filename}`;
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=800&redirects=1&format=json&origin=*`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const pageKey = Object.keys(pages)[0];
    if (pageKey === '-1') return null;
    const imageInfo = pages[pageKey]?.imageinfo?.[0];
    if (!imageInfo) return null;
    return imageInfo.thumburl || imageInfo.url || null;
  } catch {
    return null;
  }
}

async function searchWikimediaImage(keywords: string): Promise<string | null> {
  if (!keywords) return null;
  try {
    const cleanKeywords = keywords
      .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
      .replace(/_/g, ' ')
      .replace(/%20/g, ' ')
      .replace(/\b(of|the|at|in|and|or)\\b/gi, '')
      .trim();
    if (cleanKeywords.length < 3) return null;
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanKeywords)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const pageValues = Object.values(pages) as Array<{ imageinfo?: Array<{ thumburl?: string; url?: string }> }>;
    if (pageValues.length === 0) return null;
    const imageInfo = pageValues[0]?.imageinfo?.[0];
    return imageInfo?.thumburl || imageInfo?.url || null;
  } catch {
    return null;
  }
}

async function getImageFromWikimedia(originalUrl: string): Promise<string | null> {
  if (!originalUrl) return null;
  const filename = extractFilename(originalUrl);
  if (!filename) return null;
  const exactMatch = await fetchWikimediaImageUrl(filename);
  if (exactMatch) return exactMatch;
  const searchResult = await searchWikimediaImage(filename);
  if (searchResult) return searchResult;
  return null;
}

// ============ TRANSLATIONS ============
const TRANSLATIONS: Record<AppLanguage, Record<string, string>> = {
  en: {
    appName: 'CURIO',
    tagline: 'Discover Hidden Wonders',
    startExploring: 'Start Exploring',
    theRealStory: 'The Real Story',
    whyUnusual: 'Why This Is Unusual',
    whatWeKnow: 'What We Know',
    whatWeDontKnow: "What We Don't Know",
    commonMisunderstandings: 'Common Misunderstandings',
    evidenceLevel: 'Evidence Level',
    saved: 'Saved',
    share: 'Share',
    swipeToExplore: 'Swipe to explore',
    selectLanguage: 'Select Language',
    appLanguage: 'App Language',
    contentLanguage: 'Content Language',
    allLanguages: 'All Languages',
    feedRefreshed: 'Feed refreshed!',
    newItemsAdded: 'new items added!',
    linkCopied: 'Link copied!',
    shareFailed: 'Could not share',
    close: 'Close',
    adminPanel: 'Admin Panel',
    importContent: 'Import Content',
    pasteJson: 'Paste JSON content here...',
    import: 'Import',
    clearAll: 'Clear All',
    disclaimer: 'Compiled from established historical and scientific sources. Claims graded by evidence strength.',
    collections: 'Collections',
    filter: 'Filter',
    all: 'All',
    verified: 'Verified',
    strong: 'Strong',
    emerging: 'Emerging',
    theoretical: 'Theoretical',
    debated: 'Debated',
    noSavedItems: 'No saved items yet',
    tapHeartToSave: 'Tap the heart icon on any post to save it here',
    backToFeed: 'Back to Feed',
    savedItems: 'Saved Items',
  },
  hi: {
    appName: 'CURIO',
    tagline: 'छुपे हुए अजूबे खोजें',
    startExploring: 'खोज शुरू करें',
    theRealStory: 'असली कहानी',
    whyUnusual: 'यह असामान्य क्यों है',
    whatWeKnow: 'हम क्या जानते हैं',
    whatWeDontKnow: 'हम क्या नहीं जानते',
    commonMisunderstandings: 'आम गलतफहमियां',
    evidenceLevel: 'प्रमाण स्तर',
    saved: 'सहेजा गया',
    share: 'शेयर करें',
    swipeToExplore: 'खोजने के लिए स्वाइप करें',
    selectLanguage: 'भाषा चुनें',
    appLanguage: 'ऐप भाषा',
    contentLanguage: 'सामग्री भाषा',
    allLanguages: 'सभी भाषाएं',
    feedRefreshed: 'फ़ीड ताज़ा हो गई!',
    newItemsAdded: 'नई पोस्ट जोड़ी गईं!',
    linkCopied: 'लिंक कॉपी हो गया!',
    shareFailed: 'शेयर नहीं हो सका',
    close: 'बंद करें',
    adminPanel: 'एडमिन पैनल',
    importContent: 'सामग्री आयात करें',
    pasteJson: 'JSON यहां पेस्ट करें...',
    import: 'आयात करें',
    clearAll: 'सभी हटाएं',
    disclaimer: 'स्थापित ऐतिहासिक और वैज्ञानिक स्रोतों से संकलित।',
    collections: 'संग्रह',
    filter: 'फ़िल्टर',
    all: 'सभी',
    verified: 'सत्यापित',
    strong: 'मजबूत',
    emerging: 'उभरता',
    theoretical: 'सैद्धांतिक',
    debated: 'विवादित',
    noSavedItems: 'अभी तक कोई सहेजी गई पोस्ट नहीं',
    tapHeartToSave: 'सहेजने के लिए किसी भी पोस्ट पर दिल का आइकन टैप करें',
    backToFeed: 'फ़ीड पर वापस',
    savedItems: 'सहेजी गई पोस्ट',
  },
  kn: {
    appName: 'CURIO',
    tagline: 'ಅಡಗಿರುವ ಅದ್ಭುತಗಳನ್ನು ಅನ್ವೇಷಿಸಿ',
    startExploring: 'ಅನ್ವೇಷಣೆ ಪ್ರಾರಂಭಿಸಿ',
    theRealStory: 'ನಿಜವಾದ ಕಥೆ',
    whyUnusual: 'ಇದು ಏಕೆ ಅಸಾಮಾನ್ಯ',
    whatWeKnow: 'ನಮಗೆ ತಿಳಿದಿರುವುದು',
    whatWeDontKnow: 'ನಮಗೆ ತಿಳಿಯದಿರುವುದು',
    commonMisunderstandings: 'ಸಾಮಾನ್ಯ ತಪ್ಪು ಕಲ್ಪನೆಗಳು',
    evidenceLevel: 'ಸಾಕ್ಷ್ಯ ಮಟ್ಟ',
    saved: 'ಉಳಿಸಲಾಗಿದೆ',
    share: 'ಹಂಚಿಕೊಳ್ಳಿ',
    swipeToExplore: 'ಅನ್ವೇಷಿಸಲು ಸ್ವೈಪ್ ಮಾಡಿ',
    selectLanguage: 'ಭಾಷೆ ಆಯ್ಕೆಮಾಡಿ',
    appLanguage: 'ಆಪ್ ಭಾಷೆ',
    contentLanguage: 'ವಿಷಯ ಭಾಷೆ',
    allLanguages: 'ಎಲ್ಲಾ ಭಾಷೆಗಳು',
    feedRefreshed: 'ಫೀಡ್ ರಿಫ್ರೆಶ್ ಆಯಿತು!',
    newItemsAdded: 'ಹೊಸ ಪೋಸ್ಟ್‌ಗಳು ಸೇರಿಸಲಾಗಿದೆ!',
    linkCopied: 'ಲಿಂಕ್ ಕಾಪಿ ಆಯಿತು!',
    shareFailed: 'ಹಂಚಿಕೊಳ್ಳಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ',
    close: 'ಮುಚ್ಚಿ',
    adminPanel: 'ಅಡ್ಮಿನ್ ಪ್ಯಾನಲ್',
    importContent: 'ವಿಷಯ ಆಮದು ಮಾಡಿ',
    pasteJson: 'JSON ಇಲ್ಲಿ ಪೇಸ್ಟ್ ಮಾಡಿ...',
    import: 'ಆಮದು',
    clearAll: 'ಎಲ್ಲಾ ಅಳಿಸಿ',
    disclaimer: 'ಸ್ಥಾಪಿತ ಐತಿಹಾಸಿಕ ಮತ್ತು ವೈಜ್ಞಾನಿಕ ಮೂಲಗಳಿಂದ ಸಂಕಲಿಸಲಾಗಿದೆ.',
    collections: 'ಸಂಗ್ರಹಗಳು',
    filter: 'ಫಿಲ್ಟರ್',
    all: 'ಎಲ್ಲಾ',
    verified: 'ಪರಿಶೀಲಿತ',
    strong: 'ಬಲವಾದ',
    emerging: 'ಉದಯೋನ್ಮುಖ',
    theoretical: 'ಸೈದ್ಧಾಂತಿಕ',
    debated: 'ವಿವಾದಿತ',
    noSavedItems: 'ಇನ್ನೂ ಯಾವುದೇ ಉಳಿಸಿದ ಪೋಸ್ಟ್‌ಗಳಿಲ್ಲ',
    tapHeartToSave: 'ಇಲ್ಲಿ ಉಳಿಸಲು ಯಾವುದೇ ಪೋಸ್ಟ್‌ನಲ್ಲಿ ಹೃದಯ ಐಕಾನ್ ಟ್ಯಾಪ್ ಮಾಡಿ',
    backToFeed: 'ಫೀಡ್‌ಗೆ ಹಿಂತಿರುಗಿ',
    savedItems: 'ಉಳಿಸಿದ ಪೋಸ್ಟ್‌ಗಳು',
  },
};

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' },
];

const APP_LANGUAGES = LANGUAGES.filter(l => ['en', 'hi', 'kn'].includes(l.code));

// ============ SAMPLE DATA ============
const SAMPLE_ITEMS: CurioItem[] = [
  {
    id: 'sample-iron-pillar',
    title: 'This 1,600-year-old iron pillar has never rusted',
    subtext: 'Qutub Complex, Delhi • 5th Century CE',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/IRON_PILLAR_DELHI.jpg',
    badges: ['Verified', 'Metallurgy'],
    collection: 'Ancient Engineering',
    summary: 'Standing in the Qutub Complex, this iron pillar has resisted corrosion for over 1,600 years despite exposure to the elements.',
    anomaly: 'Modern iron structures rust within decades, yet this ancient pillar remains largely rust-free after 16 centuries.',
    known_facts: [
      'The pillar is 99.7% pure wrought iron',
      'A thin layer of misawite protects it from rust',
      'It was originally erected by Chandragupta II'
    ],
    unknowns: [
      'Whether the rust resistance was intentional or accidental',
      'The exact forging techniques used'
    ],
    myths: [
      '❌ Made with alien technology',
      '✓ Result of skilled ancient metallurgy and high phosphorus content'
    ],
    evidence_tier: 'verified',
    language: 'en'
  },
  {
    id: 'sample-stepwell-chand-baori',
    title: 'A 1,200-year-old geometric wonder hidden in plain sight',
    subtext: 'Abhaneri, Rajasthan • 9th Century CE',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Chand_Baori_Abhaneri_Rajasthan_India.jpg',
    badges: ['Verified', 'Architecture'],
    collection: 'Ancient Engineering',
    summary: 'Chand Baori is one of the deepest and largest stepwells in India, featuring 3,500 perfectly symmetrical steps descending 13 stories.',
    anomaly: 'The mathematical precision required to create this inverted pyramid in the 9th century challenges our understanding of ancient engineering.',
    known_facts: [
      'Contains 3,500 narrow steps arranged in perfect symmetry',
      'Descends approximately 20 meters into the earth',
      'Built during the reign of King Chanda'
    ],
    unknowns: [
      'The exact construction methods and timeline',
      'How the symmetry was maintained during construction'
    ],
    myths: [
      '❌ Built by supernatural beings overnight',
      '✓ Result of sophisticated ancient architectural planning'
    ],
    evidence_tier: 'verified',
    language: 'en'
  },
  {
    id: 'sample-living-bridges',
    title: 'These bridges are grown, not built — and they get stronger with age',
    subtext: 'Meghalaya, India • 500+ years old',
    image_url: 'https://upload.wikimedia.org/wikipedia/commons/f/f8/Doubledeckerlivingbridge.jpg',
    badges: ['Verified', 'Bio-engineering'],
    collection: 'Living Architecture',
    summary: 'The Khasi people have been training rubber tree roots to grow into natural bridges for centuries.',
    anomaly: 'Unlike conventional bridges that decay, these living structures actually strengthen over time.',
    known_facts: [
      'Made from Ficus elastica (rubber fig) roots',
      'Can support the weight of 50+ people',
      'Take 15-30 years to become functional'
    ],
    unknowns: [
      'The full extent of the root network underground',
      'Maximum lifespan of these structures'
    ],
    myths: [
      '❌ Formed naturally without human intervention',
      '✓ Carefully guided by generations of Khasi people'
    ],
    evidence_tier: 'verified',
    language: 'en'
  }
];

// ============ ROBUST IMAGE COMPONENT ============
interface RobustImageProps {
  itemId: string;
  src: string;
  alt: string;
  className?: string;
}

const RobustImage = memo(({ itemId, src, alt, className }: RobustImageProps) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const mountedRef = useRef(true);
  const gradient = getGradientForItem(itemId);

  useEffect(() => {
    mountedRef.current = true;
    setStatus('loading');
    
    const cached = getCachedImage(itemId);
    if (cached) {
      setCurrentUrl(cached);
      setStatus('loaded');
      return;
    }
    
    if (!src || !src.startsWith('http')) {
      setStatus('error');
      return;
    }
    
    loadImageWithWikimediaAPI(src);
    
    return () => { mountedRef.current = false; };
  }, [itemId, src]);
  
  const loadImageWithWikimediaAPI = async (originalUrl: string) => {
    if (!mountedRef.current) return;
    
    try {
      const wikimediaUrl = await getImageFromWikimedia(originalUrl);
      
      if (wikimediaUrl && mountedRef.current) {
        const img = new Image();
        img.referrerPolicy = 'no-referrer';
        
        img.onload = () => {
          if (mountedRef.current) {
            setCurrentUrl(wikimediaUrl);
            setStatus('loaded');
            setCachedImage(itemId, wikimediaUrl);
          }
        };
        
        img.onerror = () => {
          if (mountedRef.current) tryDirectUrl(originalUrl);
        };
        
        img.src = wikimediaUrl;
        return;
      }
      
      if (mountedRef.current) tryDirectUrl(originalUrl);
    } catch {
      if (mountedRef.current) tryDirectUrl(originalUrl);
    }
  };
  
  const tryDirectUrl = (url: string) => {
    if (!mountedRef.current) return;
    
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    
    img.onload = () => {
      if (mountedRef.current) {
        setCurrentUrl(url);
        setStatus('loaded');
        setCachedImage(itemId, url);
      }
    };
    
    img.onerror = () => {
      if (mountedRef.current) setStatus('error');
    };
    
    img.src = url;
  };

  return (
    <div className={`relative overflow-hidden ${className || ''}`}>
      {/* Gradient Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 left-1/4 w-32 h-32 border border-white/20 rounded-full" />
          <div className="absolute bottom-1/3 right-1/4 w-48 h-48 border border-white/10 rounded-full" />
        </div>
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-16 h-16 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>
      
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      
      {status === 'loaded' && currentUrl && (
        <img
          src={currentUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover z-20 animate-fade-in"
          loading="eager"
        />
      )}
    </div>
  );
});

RobustImage.displayName = 'RobustImage';

// ============ FEED CARD COMPONENT ============
interface FeedCardProps {
  item: CurioItem;
  isSaved: boolean;
  onSave: () => void;
  onShare: () => void;
  onOpenPanel: () => void;
  t: Record<string, string>;
}

const FeedCard = memo(({ item, isSaved, onSave, onShare, onOpenPanel, t }: FeedCardProps) => {
  const imageUrl = item.image_url || item.imageUrl || '';
  
  const evidenceColors: Record<string, string> = {
    verified: 'bg-emerald-500',
    strong: 'bg-blue-500',
    emerging: 'bg-yellow-500',
    theoretical: 'bg-purple-500',
    debated: 'bg-orange-500'
  };

  // Direct handlers - simple and reliable
  const handleSaveClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSave();
  };

  const handleShareClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onShare();
  };

  return (
    <div className="h-[100dvh] w-full flex-shrink-0 relative snap-start snap-always">
      {/* Background Image */}
      <RobustImage
        itemId={item.id}
        src={imageUrl}
        alt={item.title}
        className="absolute inset-0 w-full h-full"
      />

      {/* Gradient Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent z-30" style={{ height: '30%' }} />

      {/* Side Actions - Simplified touch handling */}
      <div className="absolute right-3 bottom-48 flex flex-col gap-5 z-[45]">
        {/* SAVE BUTTON */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleSaveClick}
          onTouchEnd={handleSaveClick}
          className={`w-14 h-14 backdrop-blur-md rounded-full flex items-center justify-center border transition-all shadow-lg cursor-pointer select-none ${
            isSaved ? 'bg-red-500/40 border-red-500/60' : 'bg-black/50 border-white/30'
          }`}
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          <svg 
            className={`w-7 h-7 pointer-events-none ${isSaved ? 'text-red-500 fill-red-500' : 'text-white fill-transparent'}`} 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </div>

        {/* SHARE BUTTON */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleShareClick}
          onTouchEnd={handleShareClick}
          className="w-14 h-14 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 cursor-pointer shadow-lg select-none"
          style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        >
          <svg className="w-7 h-7 text-white pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
      </div>

      {/* Bottom Content - with padding to avoid overlap */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-24 z-40">
        {/* Collection Badge */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="bg-amber-500/90 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg">
            {item.collection}
          </span>
          <span className={`${evidenceColors[item.evidence_tier]} px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1 shadow-lg`}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {t[item.evidence_tier] || item.evidence_tier}
          </span>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold leading-tight mb-2 text-white drop-shadow-lg pr-16">
          {item.title}
        </h2>

        {/* Subtext */}
        <p className="text-sm text-gray-300 mb-4 pr-16">
          {item.subtext}
        </p>

        {/* The Real Story Button */}
        <button
          onClick={onOpenPanel}
          className="w-full bg-white/15 backdrop-blur-md border border-white/30 rounded-2xl py-4 px-5 flex items-center justify-between active:scale-[0.98] transition-all shadow-lg"
        >
          <span className="font-semibold text-base">{t.theRealStory}</span>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
});

FeedCard.displayName = 'FeedCard';

// ============ DETAIL PANEL COMPONENT ============
interface DetailPanelProps {
  item: CurioItem;
  isOpen: boolean;
  onClose: () => void;
  t: Record<string, string>;
}

const DetailPanel = memo(({ item, isOpen, onClose, t }: DetailPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [isOpen, item.id]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div
        ref={panelRef}
        className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-3xl max-h-[85vh] overflow-y-auto overscroll-contain"
        style={{ touchAction: 'pan-y' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-gray-900 pt-3 pb-2 px-4 z-10">
          <div className="w-12 h-1 bg-gray-600 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{t.theRealStory}</h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full active:scale-95">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-4 pb-8 space-y-6">
          <div className="bg-gray-800/50 rounded-xl p-4">
            <p className="text-gray-200 leading-relaxed">{item.summary}</p>
          </div>

          <div>
            <h4 className="text-amber-500 font-semibold mb-2 flex items-center gap-2">
              <span className="text-lg">🔍</span> {t.whyUnusual}
            </h4>
            <p className="text-gray-300 leading-relaxed">{item.anomaly}</p>
          </div>

          <div>
            <h4 className="text-green-500 font-semibold mb-2 flex items-center gap-2">
              <span className="text-lg">✓</span> {t.whatWeKnow}
            </h4>
            <ul className="space-y-2">
              {(item.known_facts || []).map((fact, i) => (
                <li key={i} className="text-gray-300 flex gap-2">
                  <span className="text-green-500 mt-1">•</span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
              <span className="text-lg">?</span> {t.whatWeDontKnow}
            </h4>
            <ul className="space-y-2">
              {(item.unknowns || []).map((unknown, i) => (
                <li key={i} className="text-gray-300 flex gap-2">
                  <span className="text-blue-400 mt-1">•</span>
                  <span>{unknown}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-orange-400 font-semibold mb-2 flex items-center gap-2">
              <span className="text-lg">⚡</span> {t.commonMisunderstandings}
            </h4>
            <ul className="space-y-2">
              {(item.myths || []).map((myth, i) => (
                <li key={i} className="text-gray-300">{myth}</li>
              ))}
            </ul>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-4">
            <h4 className="text-gray-400 text-sm mb-2">{t.evidenceLevel}</h4>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                item.evidence_tier === 'verified' ? 'bg-green-500' :
                item.evidence_tier === 'strong' ? 'bg-blue-500' :
                item.evidence_tier === 'emerging' ? 'bg-yellow-500' :
                item.evidence_tier === 'debated' ? 'bg-orange-500' :
                'bg-purple-500'
              }`} />
              <span className="capitalize font-medium">{t[item.evidence_tier] || item.evidence_tier}</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center pt-4 border-t border-gray-800">
            {t.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
});

DetailPanel.displayName = 'DetailPanel';

// ============ MAIN APP ============
export default function App() {
  const [appLang, setAppLang] = useState<AppLanguage>('en');
  const [contentLang, setContentLang] = useState('all');
  const [showLangModal, setShowLangModal] = useState(false);
  const [langTab, setLangTab] = useState<'app' | 'content'>('app');
  const [items, setItems] = useState<CurioItem[]>([]);
  const [allItems, setAllItems] = useState<CurioItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [showPanel, setShowPanel] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminJson, setAdminJson] = useState('');
  const [adminError, setAdminError] = useState('');
  const [toast, setToast] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('feed');

  const feedRef = useRef<HTMLDivElement>(null);
  const logoTapRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isFirstOpenRef = useRef(true);
  const lastImportedCountRef = useRef(0);
  const lastScrollIndexRef = useRef(0);
  const audioInitializedRef = useRef(false);
  const lastSaveClickRef = useRef(0);
  const lastShareClickRef = useRef(0);

  const t = TRANSLATIONS[appLang] || TRANSLATIONS.en;

  // Initialize audio context on first user interaction
  const initAudioContext = useCallback(() => {
    if (audioInitializedRef.current) return;
    try {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Resume context (required for some browsers)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      audioInitializedRef.current = true;
    } catch {}
  }, []);

  // Vibrate helper
  const vibrate = useCallback((duration: number) => {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(duration); } catch {}
    }
  }, []);

  // Play sound helper - VERY QUIET and CONSISTENT
  const playSound = useCallback((type: 'click' | 'reveal' | 'save') => {
    if (!soundEnabled) return;
    
    try {
      // Create new context if needed or reuse existing
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        audioInitializedRef.current = true;
      }
      
      const ctx = audioContextRef.current;
      if (!ctx) return;
      
      // Resume if suspended (important for iOS/Chrome)
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // Different tones for different sounds - VERY QUIET
      const settings = {
        click: { freq: 600, vol: 0.003, dur: 0.03 },
        reveal: { freq: 400, vol: 0.004, dur: 0.05 },
        save: { freq: 800, vol: 0.004, dur: 0.04 }
      };
      
      const s = settings[type];
      oscillator.frequency.value = s.freq;
      oscillator.type = 'sine';
      
      // Very quiet volume
      gainNode.gain.setValueAtTime(s.vol, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + s.dur);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + s.dur);
    } catch {
      // Silently fail
    }
  }, [soundEnabled]);

  // Load preferences on mount
  useEffect(() => {
    const savedAppLang = localStorage.getItem(STORAGE_KEYS.APP_LANG) as AppLanguage;
    const savedContentLang = localStorage.getItem(STORAGE_KEYS.CONTENT_LANG);
    const savedSound = localStorage.getItem(STORAGE_KEYS.SOUND);
    const savedItems = localStorage.getItem(STORAGE_KEYS.SAVED);
    const firstOpen = localStorage.getItem(STORAGE_KEYS.FIRST_OPEN);

    if (savedAppLang) setAppLang(savedAppLang);
    if (savedContentLang) setContentLang(savedContentLang);
    if (savedSound !== null) setSoundEnabled(savedSound === 'true');
    if (savedItems) setSavedIds(new Set(JSON.parse(savedItems)));

    if (!firstOpen) {
      isFirstOpenRef.current = true;
      setShowLangModal(true);
    } else {
      isFirstOpenRef.current = false;
      loadItems();
    }

    try {
      const imported = localStorage.getItem(STORAGE_KEYS.IMPORTED);
      if (imported) lastImportedCountRef.current = JSON.parse(imported).length;
    } catch {}

    // Initialize audio on first user interaction
    const handleFirstTouch = () => {
      initAudioContext();
      document.removeEventListener('touchstart', handleFirstTouch);
      document.removeEventListener('click', handleFirstTouch);
    };
    document.addEventListener('touchstart', handleFirstTouch, { passive: true });
    document.addEventListener('click', handleFirstTouch, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleFirstTouch);
      document.removeEventListener('click', handleFirstTouch);
    };
  }, [initAudioContext]);

  // Load items function
  const loadItems = useCallback(() => {
    let all = [...SAMPLE_ITEMS];

    try {
      const imported = localStorage.getItem(STORAGE_KEYS.IMPORTED);
      if (imported) {
        const parsedImported = JSON.parse(imported) as CurioItem[];
        all = [...parsedImported, ...all];
      }
    } catch {}

    setAllItems(all);

    let filtered = all;
    if (contentLang !== 'all') {
      filtered = filtered.filter(item => (item.language || 'en') === contentLang);
    }
    if (selectedCollection !== 'all') {
      filtered = filtered.filter(item => item.collection === selectedCollection);
    }

    setItems(filtered);
    
    // Preload images
    filtered.slice(0, 5).forEach(async (item) => {
      const url = item.image_url || item.imageUrl || '';
      if (url && url.startsWith('http') && !getCachedImage(item.id)) {
        const wikimediaUrl = await getImageFromWikimedia(url);
        if (wikimediaUrl) {
          const img = new Image();
          img.referrerPolicy = 'no-referrer';
          img.onload = () => setCachedImage(item.id, wikimediaUrl);
          img.src = wikimediaUrl;
        }
      }
    });
    
    return filtered.length;
  }, [contentLang, selectedCollection]);

  useEffect(() => {
    if (!isFirstOpenRef.current) loadItems();
  }, [contentLang, selectedCollection, loadItems]);

  const collections = (() => {
    const all = [...SAMPLE_ITEMS];
    try {
      const imported = localStorage.getItem(STORAGE_KEYS.IMPORTED);
      if (imported) all.push(...JSON.parse(imported));
    } catch {}
    return ['all', ...new Set(all.map(item => item.collection))];
  })();

  // Preload next images
  useEffect(() => {
    if (items.length === 0) return;
    
    const preloadImages = async () => {
      for (let i = currentIndex + 1; i < Math.min(currentIndex + 6, items.length); i++) {
        const item = items[i];
        const url = item.image_url || item.imageUrl || '';
        if (url && url.startsWith('http') && !getCachedImage(item.id)) {
          const wikimediaUrl = await getImageFromWikimedia(url);
          if (wikimediaUrl) {
            const img = new Image();
            img.referrerPolicy = 'no-referrer';
            img.onload = () => setCachedImage(item.id, wikimediaUrl);
            img.src = wikimediaUrl;
          }
        }
      }
    };
    
    preloadImages();
  }, [currentIndex, items]);

  // Scroll observer with haptic feedback
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            
            if (index !== lastScrollIndexRef.current) {
              lastScrollIndexRef.current = index;
              setCurrentIndex(index);
              vibrate(15);
              playSound('click');
              
              if (index === items.length - 1) {
                setTimeout(() => {
                  showToastMessage(
                    appLang === 'hi' ? '🔄 शुरुआत से देखने के लिए स्वाइप करें' : 
                    appLang === 'kn' ? '🔄 ಮೊದಲಿನಿಂದ ನೋಡಲು ಸ್ವೈಪ್ ಮಾಡಿ' : 
                    '🔄 Swipe to start from beginning'
                  );
                }, 500);
              }
            }
          }
        });
      },
      { root: feed, threshold: 0.5 }
    );

    feed.querySelectorAll('[data-index]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items, appLang, vibrate, playSound]);

  const handleStartExploring = () => {
    localStorage.setItem(STORAGE_KEYS.FIRST_OPEN, 'true');
    localStorage.setItem(STORAGE_KEYS.APP_LANG, appLang);
    localStorage.setItem(STORAGE_KEYS.CONTENT_LANG, contentLang);
    isFirstOpenRef.current = false;
    setShowLangModal(false);
    loadItems();
    vibrate(30);
    playSound('reveal');
  };

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    let currentImportedCount = 0;
    try {
      const imported = localStorage.getItem(STORAGE_KEYS.IMPORTED);
      if (imported) currentImportedCount = JSON.parse(imported).length;
    } catch {}

    loadItems();
    
    if (currentImportedCount > lastImportedCountRef.current) {
      const diff = currentImportedCount - lastImportedCountRef.current;
      showToastMessage(`${diff} ${t.newItemsAdded}`);
    } else {
      showToastMessage(t.feedRefreshed);
    }

    lastImportedCountRef.current = currentImportedCount;

    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setCurrentIndex(0);
    lastScrollIndexRef.current = 0;

    playSound('click');
    vibrate(25);

    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Show toast helper - MUST be defined before handleSave
  const showToastMessage = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2000);
  }, []);

  // SIMPLE SAVE - Direct and reliable
  const handleSave = useCallback((itemId: string) => {
    // Debounce check
    const now = Date.now();
    if (now - lastSaveClickRef.current < 300) return;
    lastSaveClickRef.current = now;
    
    // Immediate haptic
    vibrate(20);
    playSound('save');
    
    // Toggle save state
    const wasSaved = savedIds.has(itemId);
    const newSavedIds = new Set(savedIds);
    
    if (wasSaved) {
      newSavedIds.delete(itemId);
    } else {
      newSavedIds.add(itemId);
    }
    
    setSavedIds(newSavedIds);
    
    // Persist
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify([...newSavedIds]));
    } catch {}
    
    // Show toast
    showToastMessage(
      wasSaved 
        ? (appLang === 'hi' ? 'हटाया गया' : appLang === 'kn' ? 'ತೆಗೆದುಹಾಕಲಾಗಿದೆ' : 'Removed')
        : (appLang === 'hi' ? '❤️ सहेजा गया!' : appLang === 'kn' ? '❤️ ಉಳಿಸಲಾಗಿದೆ!' : '❤️ Saved!')
    );
  }, [savedIds, vibrate, playSound, appLang, showToastMessage]);

  // SIMPLE SHARE - Direct and reliable
  const handleShare = useCallback((item: CurioItem) => {
    // Debounce check
    const now = Date.now();
    if (now - lastShareClickRef.current < 500) return;
    lastShareClickRef.current = now;
    
    // Immediate haptic
    vibrate(15);
    
    const shareUrl = window.location.href;
    const shareText = `${item.title}\n\n${item.summary}\n\n${shareUrl}`;
    
    // Try Web Share API first (native mobile sharing)
    if (typeof navigator.share === 'function') {
      navigator.share({
        title: item.title,
        text: item.summary,
        url: shareUrl
      })
      .then(() => {
        showToastMessage(`✓ ${t.share}`);
      })
      .catch((error) => {
        // User cancelled - not an error
        if (error.name === 'AbortError' || error.message?.includes('cancel')) {
          return;
        }
        // Fallback to clipboard
        doCopyToClipboard(shareText);
      });
      return;
    }
    
    // Fallback - copy to clipboard
    doCopyToClipboard(shareText);
    
    function doCopyToClipboard(text: string) {
      // Method 1: Modern Clipboard API
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text)
          .then(() => {
            showToastMessage(`✓ ${t.linkCopied}`);
          })
          .catch(() => {
            doLegacyCopy(text);
          });
        return;
      }
      
      // Method 2: Legacy copy
      doLegacyCopy(text);
    }
    
    function doLegacyCopy(text: string) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        showToastMessage(success ? `✓ ${t.linkCopied}` : `✗ ${t.shareFailed}`);
      } catch {
        showToastMessage(`✗ ${t.shareFailed}`);
      }
    }
  }, [vibrate, t, showToastMessage]);

  const handleLogoTap = () => {
    logoTapRef.current += 1;
    vibrate(5);
    setTimeout(() => { logoTapRef.current = 0; }, 2000);
    if (logoTapRef.current >= 5) {
      setShowAdmin(true);
      logoTapRef.current = 0;
      vibrate(50);
    }
  };

  const handleImport = () => {
    setAdminError('');
    try {
      const parsed = JSON.parse(adminJson);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      
      const validItems: CurioItem[] = [];
      for (const item of items) {
        if (!item.id || !item.title) {
          throw new Error('Each item must have "id" and "title"');
        }
        validItems.push({
          id: item.id,
          title: item.title,
          subtext: item.subtext || '',
          image_url: item.image_url || item.imageUrl || '',
          badges: item.badges || [],
          collection: item.collection || 'Imported',
          summary: item.summary || '',
          anomaly: item.anomaly || '',
          known_facts: item.known_facts || [],
          unknowns: item.unknowns || [],
          myths: item.myths || [],
          evidence_tier: item.evidence_tier || 'emerging',
          language: item.language || 'en'
        });
      }

      let existing: CurioItem[] = [];
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.IMPORTED);
        if (stored) existing = JSON.parse(stored);
      } catch {}

      const existingIds = new Set(existing.map(i => i.id));
      const newItems = validItems.filter(i => !existingIds.has(i.id));
      const merged = [...newItems, ...existing];

      localStorage.setItem(STORAGE_KEYS.IMPORTED, JSON.stringify(merged));
      showToastMessage(`✅ ${newItems.length} items imported!`);
      setAdminJson('');
      loadItems();
      vibrate(30);
      playSound('save');
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Invalid JSON');
      vibrate(100);
    }
  };

  const handleClearImported = () => {
    localStorage.removeItem(STORAGE_KEYS.IMPORTED);
    localStorage.removeItem(STORAGE_KEYS.IMAGE_CACHE);
    loadItems();
    showToastMessage('All imported content cleared');
    vibrate(30);
  };

  // showToastMessage is defined earlier

  const handleOpenPanel = () => {
    setShowPanel(true);
    playSound('reveal');
    vibrate(40);
  };

  // Get saved items
  const savedItems = allItems.filter(item => savedIds.has(item.id));
  const currentItem = items[currentIndex];

  return (
    <div className="h-[100dvh] w-full bg-black text-white overflow-hidden">
      {/* Language Modal */}
      {showLangModal && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-amber-500/30" onClick={handleLogoTap}>
            <span className="text-3xl font-black">C</span>
          </div>
          <h1 className="text-3xl font-bold mb-1">CURIO</h1>
          <p className="text-amber-500/80 text-sm mb-8">{t.tagline}</p>

          <div className="flex bg-gray-800 rounded-full p-1 mb-6">
            <button
              onClick={() => setLangTab('app')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${langTab === 'app' ? 'bg-amber-600' : ''}`}
            >
              {t.appLanguage}
            </button>
            <button
              onClick={() => setLangTab('content')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${langTab === 'content' ? 'bg-amber-600' : ''}`}
            >
              {t.contentLanguage}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-8 max-h-[40vh] overflow-y-auto p-1">
            {langTab === 'app' ? (
              APP_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setAppLang(lang.code as AppLanguage);
                    vibrate(10);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    appLang === lang.code ? 'border-amber-500 bg-amber-500/20' : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <div className="font-bold">{lang.native}</div>
                  <div className="text-sm text-gray-400">{lang.name}</div>
                </button>
              ))
            ) : (
              <>
                <button
                  onClick={() => {
                    setContentLang('all');
                    vibrate(10);
                  }}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    contentLang === 'all' ? 'border-amber-500 bg-amber-500/20' : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <div className="font-bold">{t.allLanguages}</div>
                </button>
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setContentLang(lang.code);
                      vibrate(10);
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      contentLang === lang.code ? 'border-amber-500 bg-amber-500/20' : 'border-gray-700 bg-gray-800'
                    }`}
                  >
                    <div className="font-bold">{lang.native}</div>
                    <div className="text-sm text-gray-400">{lang.name}</div>
                  </button>
                ))}
              </>
            )}
          </div>

          <button
            onClick={handleStartExploring}
            className="w-full max-w-sm bg-gradient-to-r from-amber-600 to-amber-500 py-4 rounded-2xl font-bold text-lg transition-all active:scale-[0.98] shadow-lg shadow-amber-600/25"
          >
            {t.startExploring}
          </button>
        </div>
      )}

      {/* Header - Clean Native Style */}
      <header className="fixed top-0 left-0 right-0 z-50 safe-area-top">
        <div className="bg-gradient-to-b from-black via-black/95 to-transparent pb-6">
          <div className="flex items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-3" onClick={handleLogoTap}>
              <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl font-black">C</span>
              </div>
              <div>
                <h1 className="text-lg font-bold leading-none">{t.appName}</h1>
                <p className="text-[10px] text-amber-500/80">{t.tagline}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Saved Button */}
              <button
                onClick={() => {
                  setViewMode(viewMode === 'saved' ? 'feed' : 'saved');
                  vibrate(15);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  viewMode === 'saved' ? 'bg-red-500' : 'bg-white/10 backdrop-blur-md'
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill={viewMode === 'saved' ? 'white' : 'none'} stroke="currentColor" strokeWidth={2}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              {/* Refresh */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="w-10 h-10 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center active:scale-95 transition-all"
              >
                <svg className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {/* Sound */}
              <button
                onClick={() => {
                  setSoundEnabled(!soundEnabled);
                  localStorage.setItem(STORAGE_KEYS.SOUND, String(!soundEnabled));
                  vibrate(10);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-95 transition-all ${
                  soundEnabled ? 'bg-amber-500/30' : 'bg-white/10 backdrop-blur-md'
                }`}
              >
                {soundEnabled ? (
                  <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h2l3.5-4.5A.5.5 0 0110.5 5v14a.5.5 0 01-.8.4L6 15z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                )}
              </button>

              {/* Filter - Professional Button */}
              <button
                onClick={() => {
                  setShowFilter(!showFilter);
                  vibrate(10);
                }}
                className={`h-10 px-4 rounded-full flex items-center gap-2 active:scale-95 transition-all ${
                  showFilter || selectedCollection !== 'all' || contentLang !== 'all' 
                    ? 'bg-amber-500' 
                    : 'bg-white/10 backdrop-blur-md'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="text-sm font-medium">{t.filter}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Filter Dropdown - Higher z-index, better positioning */}
      {showFilter && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setShowFilter(false)} />
          <div className="fixed top-20 right-4 z-50 bg-gray-900 border border-gray-700 rounded-2xl p-3 min-w-[240px] max-h-[70vh] overflow-y-auto shadow-2xl animate-fade-in">
            {/* Collections */}
            <div className="text-xs text-gray-500 px-3 py-2 font-semibold uppercase tracking-wide">{t.collections}</div>
            <div className="space-y-1 mb-3">
              {collections.map((col) => (
                <button
                  key={col}
                  onClick={() => {
                    setSelectedCollection(col);
                    vibrate(10);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                    selectedCollection === col ? 'bg-amber-500 font-medium' : 'hover:bg-gray-800 active:bg-gray-700'
                  }`}
                >
                  <span>{col === 'all' ? t.all : col}</span>
                  {selectedCollection === col && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            
            <div className="border-t border-gray-700 my-2" />
            
            {/* Languages */}
            <div className="text-xs text-gray-500 px-3 py-2 font-semibold uppercase tracking-wide">{t.contentLanguage}</div>
            <div className="space-y-1">
              <button
                onClick={() => {
                  setContentLang('all');
                  vibrate(10);
                }}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                  contentLang === 'all' ? 'bg-amber-500 font-medium' : 'hover:bg-gray-800 active:bg-gray-700'
                }`}
              >
                <span>{t.allLanguages}</span>
                {contentLang === 'all' && (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              {LANGUAGES.slice(0, 5).map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setContentLang(lang.code);
                    vibrate(10);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                    contentLang === lang.code ? 'bg-amber-500 font-medium' : 'hover:bg-gray-800 active:bg-gray-700'
                  }`}
                >
                  <span>{lang.native}</span>
                  {contentLang === lang.code && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* App Language */}
            <div className="border-t border-gray-700 my-2" />
            <div className="text-xs text-gray-500 px-3 py-2 font-semibold uppercase tracking-wide">{t.appLanguage}</div>
            <div className="space-y-1">
              {APP_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setAppLang(lang.code as AppLanguage);
                    localStorage.setItem(STORAGE_KEYS.APP_LANG, lang.code);
                    vibrate(10);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center justify-between ${
                    appLang === lang.code ? 'bg-purple-500 font-medium' : 'hover:bg-gray-800 active:bg-gray-700'
                  }`}
                >
                  <span>{lang.native}</span>
                  {appLang === lang.code && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Close button */}
            <div className="border-t border-gray-700 mt-3 pt-3">
              <button
                onClick={() => setShowFilter(false)}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium transition-all active:scale-98"
              >
                {t.close}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Saved Items View */}
      {viewMode === 'saved' && (
        <div className="fixed inset-0 z-40 bg-black pt-20 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{t.savedItems} ({savedItems.length})</h2>
              <button
                onClick={() => setViewMode('feed')}
                className="px-4 py-2 bg-gray-800 rounded-full text-sm font-medium active:scale-95"
              >
                {t.backToFeed}
              </button>
            </div>

            {savedItems.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">💔</div>
                <p className="text-lg text-gray-400 mb-2">{t.noSavedItems}</p>
                <p className="text-sm text-gray-600">{t.tapHeartToSave}</p>
              </div>
            ) : (
              <div className="space-y-4 pb-20">
                {savedItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 active:scale-[0.99] transition-all"
                    onClick={() => {
                      const idx = items.findIndex(i => i.id === item.id);
                      if (idx >= 0) {
                        setCurrentIndex(idx);
                        setViewMode('feed');
                        if (feedRef.current) {
                          const cardHeight = window.innerHeight;
                          feedRef.current.scrollTo({ top: idx * cardHeight, behavior: 'smooth' });
                        }
                      }
                      vibrate(10);
                    }}
                  >
                    <div className="flex gap-4 p-4">
                      <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                        <RobustImage
                          itemId={item.id}
                          src={item.image_url || item.imageUrl || ''}
                          alt={item.title}
                          className="w-full h-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-amber-500 font-medium">{item.collection}</span>
                        <h3 className="font-semibold text-sm mt-1 line-clamp-2">{item.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{item.subtext}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSave(item.id);
                        }}
                        className="self-center"
                      >
                        <svg className="w-6 h-6 text-red-500 fill-red-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feed */}
      {viewMode === 'feed' && (
        <div
          ref={feedRef}
          className="h-full w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        >
          {items.map((item, index) => (
            <div key={item.id} data-index={index}>
              <FeedCard
                item={item}
                isSaved={savedIds.has(item.id)}
                onSave={() => handleSave(item.id)}
                onShare={() => handleShare(item)}
                onOpenPanel={handleOpenPanel}
                t={t}
              />
            </div>
          ))}

          {/* End Card */}
          {items.length > 0 && (
            <div 
              className="h-[100dvh] w-full flex-shrink-0 relative snap-start snap-always bg-gradient-to-br from-gray-900 via-black to-gray-900"
              data-index={items.length}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-amber-600/10 rounded-full blur-3xl" />
                
                <div className="relative z-10 text-center">
                  <div className="text-6xl mb-6">🎉</div>
                  <h2 className="text-2xl font-bold mb-3">
                    {appLang === 'hi' ? 'आपने सब देख लिया!' : 
                     appLang === 'kn' ? 'ನೀವು ಎಲ್ಲವನ್ನೂ ನೋಡಿದ್ದೀರಿ!' : 
                     "You've explored them all!"}
                  </h2>
                  <p className="text-gray-400 mb-8">
                    {appLang === 'hi' ? `${items.length} रोचक खोजें` : 
                     appLang === 'kn' ? `${items.length} ಆಸಕ್ತಿದಾಯಕ ಆವಿಷ್ಕಾರಗಳು` : 
                     `${items.length} fascinating discoveries`}
                  </p>
                  
                  <button
                    onClick={() => {
                      if (feedRef.current) {
                        feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                      setCurrentIndex(0);
                      lastScrollIndexRef.current = 0;
                      playSound('click');
                      vibrate(25);
                    }}
                    className="bg-gradient-to-r from-amber-600 to-amber-500 px-8 py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-lg shadow-amber-500/25"
                  >
                    {appLang === 'hi' ? '🔄 शुरुआत से देखें' : 
                     appLang === 'kn' ? '🔄 ಮೊದಲಿನಿಂದ ನೋಡಿ' : 
                     '🔄 Start from Beginning'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500 px-8">
                <div className="text-5xl mb-4">🔍</div>
                <p className="text-lg mb-2">
                  {appLang === 'hi' ? 'कोई पोस्ट नहीं मिली' : 
                   appLang === 'kn' ? 'ಯಾವುದೇ ಪೋಸ್ಟ್ ಕಂಡುಬಂದಿಲ್ಲ' : 
                   'No items found'}
                </p>
                <button
                  onClick={() => {
                    setContentLang('all');
                    setSelectedCollection('all');
                    vibrate(15);
                  }}
                  className="mt-4 px-6 py-3 bg-amber-600 rounded-xl font-bold active:scale-95"
                >
                  {appLang === 'hi' ? 'फ़िल्टर रीसेट करें' : 
                   appLang === 'kn' ? 'ಫಿಲ್ಟರ್ ಮರುಹೊಂದಿಸಿ' : 
                   'Reset Filters'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress - Repositioned to avoid content overlap */}
      {viewMode === 'feed' && items.length > 0 && currentIndex < items.length && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-black/80 backdrop-blur-md px-4 py-2.5 rounded-full border border-white/10 shadow-lg">
          <span className="text-sm font-bold text-white">{currentIndex + 1}</span>
          <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
            />
          </div>
          <span className="text-sm text-gray-400">{items.length}</span>
        </div>
      )}

      {/* Detail Panel */}
      {currentItem && (
        <DetailPanel
          item={currentItem}
          isOpen={showPanel}
          onClose={() => {
            setShowPanel(false);
            vibrate(15);
          }}
          t={t}
        />
      )}

      {/* Admin Panel */}
      {showAdmin && (
        <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
          <div className="max-w-2xl mx-auto p-4 pb-20">
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-black py-4 z-10">
              <h2 className="text-xl font-bold text-amber-500">🔧 {t.adminPanel}</h2>
              <button
                onClick={() => {
                  setShowAdmin(false);
                  vibrate(15);
                }}
                className="p-2 bg-gray-800 rounded-full active:scale-95"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-gradient-to-br from-amber-900/30 to-amber-800/10 border border-amber-700/50 rounded-2xl p-5">
                <h3 className="font-bold text-amber-400 mb-3">📋 How to Import Content</h3>
                <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                  <li>Prepare your JSON following the format below</li>
                  <li>Paste the JSON in the text area</li>
                  <li>Click "Import" to add to your feed</li>
                  <li>Click refresh (↻) to see new content</li>
                </ol>
              </div>

              {/* Image URL Guide */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                <h3 className="font-bold text-green-400 mb-3">🖼️ Image URL Guide</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-green-400 font-semibold mb-1">✅ CORRECT:</p>
                    <code className="text-xs text-green-300 bg-green-900/30 px-2 py-1 rounded block break-all">
                      https://upload.wikimedia.org/wikipedia/commons/X/XX/Filename.jpg
                    </code>
                  </div>
                  <div>
                    <p className="text-red-400 font-semibold mb-1">❌ WRONG:</p>
                    <code className="text-xs text-red-300 bg-red-900/30 px-2 py-1 rounded block break-all">
                      https://en.wikipedia.org/wiki/File:Example.jpg
                    </code>
                  </div>
                </div>
              </div>

              {/* Sample JSON */}
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                <h3 className="font-bold text-purple-400 mb-3">📝 Sample JSON</h3>
                <pre className="text-xs text-gray-300 bg-gray-800 rounded-xl p-4 overflow-x-auto">
{`[
  {
    "id": "unique-id",
    "title": "Your headline",
    "subtext": "Location • Time",
    "image_url": "https://upload...",
    "badges": ["Verified"],
    "collection": "Category",
    "summary": "Summary text.",
    "anomaly": "What's unusual.",
    "known_facts": ["Fact 1"],
    "unknowns": ["Unknown 1"],
    "myths": ["❌ Wrong", "✓ Right"],
    "evidence_tier": "verified",
    "language": "en"
  }
]`}
                </pre>
              </div>

              {/* Import Area */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  {t.importContent}
                </label>
                <textarea
                  value={adminJson}
                  onChange={(e) => setAdminJson(e.target.value)}
                  placeholder={t.pasteJson}
                  className="w-full h-48 bg-gray-800 border border-gray-600 rounded-xl p-4 text-sm font-mono resize-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  spellCheck={false}
                />
              </div>

              {adminError && (
                <div className="bg-red-500/20 border border-red-500 text-red-400 px-4 py-3 rounded-xl text-sm">
                  ⚠️ {adminError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleImport}
                  className="flex-1 bg-gradient-to-r from-amber-600 to-amber-500 py-4 rounded-xl font-bold text-lg active:scale-[0.98]"
                >
                  ⬆️ {t.import}
                </button>
                <button
                  onClick={handleClearImported}
                  className="px-6 py-4 bg-red-600/20 border border-red-600 text-red-400 rounded-xl font-bold active:scale-[0.98]"
                >
                  🗑️
                </button>
              </div>

              <div className="bg-gray-800/50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-400">
                  Imported: <span className="text-amber-500 font-bold">{(() => {
                    try {
                      const imported = localStorage.getItem(STORAGE_KEYS.IMPORTED);
                      return imported ? JSON.parse(imported).length : 0;
                    } catch { return 0; }
                  })()}</span> items
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] bg-gray-800 text-white px-6 py-3 rounded-full shadow-lg border border-gray-700 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
