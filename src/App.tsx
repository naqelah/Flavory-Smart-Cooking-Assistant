import React, { useState, useEffect } from 'react';
import { 
  ChefHat, 
  Plus, 
  Trash2, 
  Timer, 
  Flame, 
  ArrowRight, 
  Heart,
  Ban,
  ChefHat as ChefIcon, 
  Sparkles,
  UtensilsCrossed,
  Wind,
  Beef,
  Wheat,
  Sparkles as SaltIcon,
  Save,
  RotateCcw,
  Loader2,
  Pencil,
  Check,
  X,
  RefreshCw,
  Share2,
  LogOut,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateRecipe, RecipeResult } from './services/gemini';
import { estimateCalories } from './lib/calorieConstants';
import { auth, db, signInWithGoogle, logout } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp, getDocFromServer } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface Ingredient {
  name: string;
  type: 'normal' | 'favorite' | 'forbidden';
  calories?: number | null;
  amount?: string;
}

export default function App() {
  const [ingredientInput, setIngredientInput] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<'normal' | 'favorite' | 'forbidden'>('normal');
  const [activeFilter, setActiveFilter] = useState<'all' | 'favorite' | 'forbidden'>('all');
  const [recipe, setRecipe] = useState<RecipeResult | null>(null);
  const [savedRecipes, setSavedRecipes] = useState<RecipeResult[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'home' | 'saved'>('home');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Firestore Saved Recipes Listener
  useEffect(() => {
    if (!user) {
      // Fallback to local storage if not logged in
      const saved = localStorage.getItem('flavory_recipes');
      if (saved) {
        try {
          setSavedRecipes(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to parse saved recipes', e);
        }
      }
      return;
    }

    const path = `users/${user.uid}/savedRecipes`;
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recipes = snapshot.docs.map(doc => doc.data() as RecipeResult);
      setSavedRecipes(recipes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  // Local Storage persistence only for guests
  useEffect(() => {
    if (!user) {
      localStorage.setItem('flavory_recipes', JSON.stringify(savedRecipes));
    }
  }, [savedRecipes, user]);

  const handleSaveRecipe = async (recipeToSave: RecipeResult) => {
    if (savedRecipes.some(r => r.menuName === recipeToSave.menuName)) return;

    if (!user) {
      // Guest save
      setSavedRecipes([recipeToSave, ...savedRecipes]);
      return;
    }

    const path = `users/${user.uid}/savedRecipes`;
    const recipeId = recipeToSave.menuName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    
    try {
      await setDoc(doc(db, path, recipeId), {
        ...recipeToSave,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${path}/${recipeId}`);
    }
  };

  const logoutAndReset = async () => {
    await logout();
    setRecipe(null);
    setView('home');
  };

  const handleShareRecipe = (recipeToShare: RecipeResult) => {
    const text = `Resep ${recipeToShare.menuName} dari Flavory\n\n` +
      `Waktu: ${recipeToShare.estimation.time}\n` +
      `Kalori: ${recipeToShare.estimation.calories}\n\n` +
      `Langkah:\n${recipeToShare.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n` +
      `Tips: ${recipeToShare.storageTips}`;

    if (navigator.share) {
      navigator.share({
        title: `Resep ${recipeToShare.menuName}`,
        text: text,
        url: window.location.href
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(text).then(() => {
        alert('Resep disalin ke papan klip!');
      });
    }
  };

  const removeSavedRecipe = async (menuName: string) => {
    if (!user) {
      setSavedRecipes(savedRecipes.filter(r => r.menuName !== menuName));
      return;
    }

    const recipeId = menuName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const path = `users/${user.uid}/savedRecipes/${recipeId}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const addIngredient = () => {
    if (ingredientInput.trim() && !ingredients.some(i => i.name.toLowerCase() === ingredientInput.trim().toLowerCase())) {
      const name = ingredientInput.trim();
      const calories = estimateCalories(name);
      setIngredients([...ingredients, { name, type: 'normal', calories, amount: 'secukupnya' }]);
      setIngredientInput('');
    }
  };

  const removeIngredient = (name: string) => {
    setIngredients(ingredients.filter(i => i.name !== name));
  };

  const toggleStatus = (name: string) => {
    setIngredients(ingredients.map(i => {
      if (i.name === name) {
        const nextType: Ingredient['type'] = i.type === 'normal' ? 'favorite' : i.type === 'favorite' ? 'forbidden' : 'normal';
        return { ...i, type: nextType };
      }
      return i;
    }));
  };

  const startEditing = (item: Ingredient) => {
    setEditingName(item.name);
    setEditValue(item.name);
    setEditAmount(item.amount || '');
    setEditType(item.type);
  };

  const saveEdit = () => {
    if (editingName && editValue.trim()) {
      // Check if the new name already exists (excluding the one being edited)
      const exists = ingredients.some(i => i.name.toLowerCase() === editValue.trim().toLowerCase() && i.name !== editingName);
      if (!exists) {
        const newName = editValue.trim();
        const newAmount = editAmount.trim() || 'secukupnya';
        const newCalories = estimateCalories(newName);
        setIngredients(ingredients.map(i => 
          i.name === editingName ? { ...i, name: newName, calories: newCalories, amount: newAmount, type: editType } : i
        ));
      }
      setEditingName(null);
    }
  };

  const cancelEdit = () => {
    setEditingName(null);
  };

  const handleCreateRecipe = async (isVariation: boolean = false) => {
    if (ingredients.length === 0) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await generateRecipe(ingredients, isVariation);
      setRecipe(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setIngredients([]);
    setRecipe(null);
    setError(null);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Navigation */}
      <nav className="h-auto min-h-[5rem] border-b border-natural-border flex flex-col sm:flex-row items-center justify-between px-6 sm:px-10 py-4 sm:py-0 bg-white sticky top-0 z-50 gap-4 sm:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-moss rounded-xl flex items-center justify-center text-white shrink-0">
            <ChefHat className="w-6 h-6" />
          </div>
          <span className="text-xl sm:text-2xl font-serif font-bold tracking-tight text-natural-heading italic shrink-0">Flavory</span>
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-sm font-medium text-natural-muted w-full sm:w-auto justify-center sm:justify-end">
          <span 
            onClick={() => setView('saved')}
            className={`${view === 'saved' ? 'text-brand-moss border-b-2 border-brand-moss' : 'hover:text-brand-moss'} pb-1 cursor-pointer transition-all whitespace-nowrap`}
          >
            Dapur Saya
          </span>
          <span 
            onClick={() => setView('home')}
            className={`${view === 'home' ? 'text-brand-moss border-b-2 border-brand-moss' : 'hover:text-brand-moss'} pb-1 cursor-pointer transition-all whitespace-nowrap`}
          >
            Masak Baru
          </span>
          {user ? (
            <div className="flex items-center gap-2 sm:gap-4 border-l border-brand-moss/10 pl-4 sm:pl-6">
              <div className="hidden min-[400px]:flex flex-col items-end">
                <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider">Hai, Chef!</span>
                <span className="text-xs font-bold text-natural-heading line-clamp-1 max-w-[100px]">{user.displayName?.split(' ')[0]}</span>
              </div>
              <button 
                onClick={logoutAndReset}
                className="p-2 hover:bg-natural-bg rounded-full transition-all text-natural-muted hover:text-red-500"
                title="Keluar"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="bg-brand-moss text-white px-4 sm:px-6 py-2 rounded-full hover:bg-brand-moss-hover transition-colors flex items-center gap-2 text-xs sm:text-sm"
            >
              <UserIcon className="w-4 h-4" />
              Masuk
            </button>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      {view === 'home' && !recipe && (
        <header className="relative bg-natural-bg overflow-hidden py-16 sm:py-24 border-b border-natural-border">
          <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
            <div className="absolute inset-x-0 top-0 h-full rotate-12 bg-grid-slate-900/[0.04] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
          </div>
          
          <div className="container mx-auto px-4 relative">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-[280px] min-[400px]:max-w-xs sm:max-w-lg mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-clay/10 text-brand-clay text-sm font-bold mb-6 italic font-serif">
                <Sparkles className="w-4 h-4" />
                <span>Inspirasi masak tiap hari</span>
              </div>
              <h1 className="text-5xl sm:text-7xl font-bold mb-6 tracking-tight italic">
                Masak Simpel & Lezat<span className="text-brand-clay">.</span>
              </h1>
              <p className="text-lg text-natural-muted mb-8 leading-relaxed font-medium">
                Bikin masakan enak nggak pake ribet. Yuk, mulai kreasi di dapurmu sekarang!
              </p>
            </motion.div>
          </div>
        </header>
      )}

      <main className={`container mx-auto px-4 ${recipe || view === 'saved' ? 'py-12' : '-mt-10 pb-20'}`}>
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Saved Recipes View */}
          {view === 'saved' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {user ? (
                <div className="flex items-center gap-3 mb-8 bg-brand-moss/5 p-4 rounded-2xl border border-brand-moss/10">
                  <div className="w-10 h-10 rounded-full bg-brand-moss/10 flex items-center justify-center text-brand-moss">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-serif font-bold italic">Dapur Digital {user.displayName?.split(' ')[0]}</h2>
                    <p className="text-xs text-natural-muted font-medium">Semua resepmu aman tersimpan di sini.</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 bg-brand-clay/5 p-6 rounded-3xl border border-brand-clay/10">
                  <div className="flex items-center gap-4 text-center sm:text-left">
                    <div className="w-12 h-12 rounded-full bg-brand-clay/10 flex items-center justify-center text-brand-clay shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-natural-heading">Simpan resep di cloud?</h3>
                      <p className="text-sm text-natural-muted leading-tight">Masuk biar bisa akses resep favoritmu di mana aja, kapan aja.</p>
                    </div>
                  </div>
                  <button 
                    onClick={signInWithGoogle}
                    className="bg-brand-clay text-white px-8 py-3 rounded-2xl hover:bg-brand-clay-hover transition-all shadow-lg shadow-brand-clay/20 font-bold whitespace-nowrap"
                  >
                    Masuk Sekarang
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-serif font-bold italic">Koleksi Resepku</h2>
                <button 
                  onClick={() => setView('home')}
                  className="btn-primary py-2 px-6 text-sm"
                >
                  Bikin Resep Lagi
                </button>
              </div>

              {savedRecipes.length === 0 ? (
                <div className="recipe-card p-12 sm:p-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-natural-sidebar rounded-full flex items-center justify-center mx-auto text-natural-muted mb-4 text-center">
                    <Heart className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-center">Belum ada resep, nih.</h3>
                  <p className="text-natural-muted text-center">Ayo mulai eksperimen di dapur dan simpan resepnya di sini!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {savedRecipes.map((r, i) => (
                    <motion.div 
                      key={r.menuName}
                      className="recipe-card group cursor-pointer hover:border-brand-moss/30 transition-all flex flex-col"
                      onClick={() => { setRecipe(r); setView('home'); }}
                    >
                      <div className="p-6 bg-brand-moss text-white h-32 flex flex-col justify-end">
                        <div className="flex justify-between items-start mb-auto">
                          <span className="text-[10px] uppercase font-bold tracking-widest bg-white/20 px-2 py-0.5 rounded-md">Tersimpan</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              removeSavedRecipe(r.menuName);
                            }}
                            className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <h4 className="text-xl font-bold italic truncate">{r.menuName}</h4>
                      </div>
                      <div className="p-4 flex gap-4 text-xs font-bold text-natural-muted">
                        <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> {r.estimation.time}</span>
                        <span className="flex items-center gap-1"><Flame className="w-3 h-3" /> {r.estimation.calories}</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Input Card */}
          {view === 'home' && !recipe && (
            <motion.div 
              layout
              className="recipe-card p-6 sm:p-12 relative z-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1.5 h-6 bg-brand-clay rounded-full" />
                <h2 className="text-xl sm:text-2xl font-serif font-bold italic">masukan bahan yang kamu punya</h2>
              </div>

              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 flex gap-3">
                    <input
                      type="text"
                      value={ingredientInput}
                      onChange={(e) => setIngredientInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addIngredient()}
                      placeholder="Nama Bahan (ex: Ayam)"
                      className="input-field flex-1"
                    />
                  </div>
                  <button 
                    onClick={addIngredient}
                    className="bg-brand-moss hover:bg-brand-moss-hover text-white px-6 sm:px-8 py-3 sm:py-4 rounded-2xl transition-all shadow-lg shadow-brand-moss/20 active:scale-95 flex items-center justify-center gap-2 font-bold text-sm sm:text-base"
                  >
                    <Plus className="w-5 h-5" />
                    Tambah
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 sm:px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all
                      ${activeFilter === 'all' ? 'bg-brand-moss text-white' : 'bg-natural-bg text-natural-muted border border-natural-border-soft'}`}
                  >
                    Semua ({ingredients.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('favorite')}
                    className={`px-3 sm:px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2
                      ${activeFilter === 'favorite' ? 'bg-rose-500 text-white' : 'bg-natural-bg text-natural-muted border border-natural-border-soft'}`}
                  >
                    <Heart className={`w-3 h-3 ${activeFilter === 'favorite' ? 'fill-current' : ''}`} />
                    Favorit ({ingredients.filter(i => i.type === 'favorite').length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('forbidden')}
                    className={`px-3 sm:px-4 py-1.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2
                      ${activeFilter === 'forbidden' ? 'bg-orange-500 text-white' : 'bg-natural-bg text-natural-muted border border-natural-border-soft'}`}
                  >
                    <Ban className="w-3 h-3" />
                    Pantangan ({ingredients.filter(i => i.type === 'forbidden').length})
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 sm:gap-3 pt-2">
                  <AnimatePresence mode="popLayout">
                    {ingredients
                      .filter(i => activeFilter === 'all' ? true : i.type === activeFilter)
                      .map((item) => (
                      <motion.div
                        key={item.name}
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: -20, transition: { duration: 0.2 } }}
                        layout
                        className={`inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border transition-all select-none group
                          ${item.type === 'normal' ? 'bg-natural-sidebar text-brand-moss border-natural-border-soft' : 
                            item.type === 'favorite' ? 'bg-rose-50 text-rose-600 border-rose-200' : 
                            'bg-orange-50 text-orange-600 border-orange-200'}`}
                      >
                        {editingName === item.name ? (
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-1">
                              <input
                                autoFocus
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEdit();
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                className="bg-white/50 border-none outline-none font-bold p-0 w-24 text-sm"
                                placeholder="Nama"
                              />
                            </div>
                            
                            <div className="flex gap-1.5 border-l border-brand-moss/10 pl-3">
                              <button 
                                onClick={() => setEditType('normal')}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${editType === 'normal' ? 'bg-brand-moss text-white' : 'bg-natural-bg text-natural-muted hover:bg-natural-border'}`}
                                title="Normal"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setEditType('favorite')}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${editType === 'favorite' ? 'bg-rose-500 text-white' : 'bg-natural-bg text-natural-muted hover:bg-rose-100/50'}`}
                                title="Jadikan Favorit"
                              >
                                <Heart className={`w-3.5 h-3.5 ${editType === 'favorite' ? 'fill-current' : ''}`} />
                              </button>
                              <button 
                                onClick={() => setEditType('forbidden')}
                                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${editType === 'forbidden' ? 'bg-natural-heading text-white' : 'bg-natural-bg text-natural-muted hover:bg-natural-border'}`}
                                title="Jadikan Pantangan"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="flex gap-1 border-l border-brand-moss/10 pl-3">
                              <button onClick={saveEdit} className="text-emerald-500 hover:text-emerald-600 p-1"><Check className="w-5 h-5 font-bold" /></button>
                              <button onClick={cancelEdit} className="text-red-400 hover:text-red-500 p-1"><X className="w-5 h-5" /></button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div 
                              className="flex items-center gap-2 cursor-pointer"
                              onClick={() => toggleStatus(item.name)}
                              title="Klik untuk ubah jenis bahan"
                            >
                              {item.type === 'favorite' && <Heart className="w-4 h-4 fill-current" />}
                              {item.type === 'forbidden' && <Ban className="w-4 h-4" />}
                              <div className="flex flex-col items-start leading-none">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-bold">{item.name}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1 ml-1 border-l border-current/20 pl-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => startEditing(item)}
                                className="hover:text-brand-moss transition-colors p-0.5"
                                title="Edit bahan"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeIngredient(item.name);
                                }} 
                                className="hover:text-red-500 transition-colors p-0.5"
                                title="Hapus"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {ingredients.length === 0 && (
                    <p className="text-natural-muted text-sm italic">Belum ada bahan yang ditambahkan...</p>
                  )}
                  {ingredients.length > 0 && 
                    ingredients.filter(i => activeFilter === 'all' ? true : i.type === activeFilter).length === 0 && (
                    <p className="text-natural-muted text-sm italic">Tidak ada bahan dalam kategori ini...</p>
                  )}
                </div>

                {ingredients.length > 0 && (
                  <div className="flex flex-wrap gap-4 pt-2">
                    <p className="text-[10px] text-natural-muted font-bold uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-200" /> Klik tag untuk ubah status:
                    </p>
                    <div className="flex gap-4">
                      <span className="text-[10px] text-rose-600 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Heart className="w-3 h-3 fill-current" /> Favorit
                      </span>
                      <span className="text-[10px] text-orange-600 font-bold uppercase tracking-widest flex items-center gap-1.5">
                        <Ban className="w-3 h-3" /> Pantangan
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-8 flex flex-col items-center">
                  <button
                    onClick={handleCreateRecipe}
                    disabled={ingredients.length === 0 || isLoading}
                    className="btn-primary w-full sm:w-auto min-w-[280px] flex items-center justify-center gap-3"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Lagi ngeracik resep buatmu...
                      </>
                    ) : (
                      <>
                        <UtensilsCrossed className="w-5 h-5" />
                        Cek Resepnya
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  <p className="mt-4 text-xs text-natural-muted font-medium uppercase tracking-widest italic flex items-center gap-2">
                    <Sparkles className="w-3 h-3" /> Powered by Chef AI
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Error Message & Solutions */}
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
            >
              <div className="p-6 bg-brand-clay-light border border-brand-clay/20 text-brand-clay rounded-3xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold mb-0.5">
                    {error === 'QUOTA_EXCEEDED' ? 'Dapur AI Lagi Rame Banget' : 'Waduh, ada masalah dikit!'}
                  </p>
                  <p className="text-sm opacity-80">
                    {error === 'QUOTA_EXCEEDED' 
                      ? 'Banyak koki lagi masak juga nih. Chef AI kami butuh napas bentar (sekitar 30-60 detik).' 
                      : error}
                  </p>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-natural-border shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-natural-sidebar flex items-center justify-center text-natural-muted">
                    <Check className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-serif font-bold italic">
                    {error === 'QUOTA_EXCEEDED' ? 'Coba cara ini, yuk:' : 'Solusi biar lancar lagi:'}
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {error === 'QUOTA_EXCEEDED' ? (
                    <>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">1</span>
                          Tunggu 30 Detik
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Biar Chef AI fokus dulu nyelesaiin antrean resep koki sebelah.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">2</span>
                          Klik Lagi Aja
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Biasanya percobaan kedua suka langsung tembus kok kalau antrean lancar.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">3</span>
                          Kurangi Bahan Dikit
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Resep yang lebih simpel kadang bikin Chef AI mikirnya lebih cepet.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">4</span>
                          Refresh Halaman
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Kalau masih stuck, cara paling ampuh ya cuma di-refresh halamannya.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">1</span>
                          Cek Bahannya Lagi
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Coba pake bahan yang lebih umum kayak Telur atau Nasi dulu ya Chef.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">2</span>
                          Koneksi Internet
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Pastiin internetmu kenceng biar resep dari Chef AI cepet nyampe.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">3</span>
                          Pake 2-3 Bahan
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Minimal masukin 2 atau 3 bahan utama biar Chef AI nggak bingung.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-natural-heading flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-brand-moss/10 text-brand-moss flex items-center justify-center text-[10px]">4</span>
                          Refresh Aja
                        </p>
                        <p className="text-xs text-natural-muted leading-relaxed pl-7">
                          Kalau masih bandel, klik 'Bikin Lagi' atau muat ulang browser kamu.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Recipe Result */}
          {recipe && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              {/* Reset / Actions Bar */}
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center bg-white p-4 rounded-2xl border border-natural-border shadow-sm gap-4">
                <button 
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-natural-sidebar border border-natural-border-soft text-natural-muted font-bold hover:bg-natural-border-soft transition-colors text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  Bikin Lagi
                </button>
                <div className="grid grid-cols-2 lg:flex lg:flex-row gap-2">
                  <button 
                    onClick={() => handleCreateRecipe(true)}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-full bg-white border border-natural-border text-brand-moss font-bold hover:bg-natural-bg transition-colors text-xs sm:text-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden min-[400px]:inline">Cari Ide Baru</span>
                    <span className="min-[400px]:hidden">Ide Baru</span>
                  </button>
                  <button 
                    onClick={() => handleSaveRecipe(recipe)}
                    className={`inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-full font-bold transition-all shadow-sm border text-xs sm:text-sm
                      ${savedRecipes.some(r => r.menuName === recipe.menuName) 
                        ? 'bg-rose-500 text-white border-rose-500' 
                        : 'bg-white hover:bg-natural-bg text-natural-muted border-natural-border'}`}
                  >
                    <Save className="w-4 h-4" />
                    {savedRecipes.some(r => r.menuName === recipe.menuName) ? 'Tersimpan' : 'Simpan'}
                  </button>
                  <button 
                    onClick={() => handleShareRecipe(recipe)}
                    className="col-span-2 lg:col-auto inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-full bg-white border border-natural-border text-natural-muted font-bold hover:bg-natural-bg transition-colors text-xs sm:text-sm shadow-sm"
                  >
                    <Share2 className="w-4 h-4" />
                    Bagikan
                  </button>
                </div>
              </div>

              {/* Main Display */}
              <div className="recipe-card flex flex-col md:flex-row min-h-0 sm:min-h-[600px] overflow-hidden">
                {/* Sidebar Analysis */}
                <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-natural-border bg-natural-sidebar p-6 sm:p-10 flex flex-col gap-8 md:gap-10">
                  <div className="space-y-6">
                    <h3 className="text-xs uppercase tracking-widest font-bold text-natural-muted flex items-center gap-2">
                       Icip Bahannya
                    </h3>
                    
                    <div className="space-y-6">
                      <IngredientGroup 
                        title="Bahan Utama" 
                        items={recipe.originalIngredients?.map(i => ({ name: i.name, amount: i.amount || 'secukupnya' }))} 
                        icon={<Sparkles className="w-4 h-4" />} 
                        colorClass="text-brand-moss"
                      />
                      <IngredientGroup 
                        title="Karbohidrat" 
                        items={recipe.analysis?.carbs} 
                        icon={<Wheat className="w-4 h-4" />} 
                        colorClass="text-brand-clay"
                      />
                      <IngredientGroup 
                        title="Protein" 
                        items={recipe.analysis?.protein} 
                        icon={<Beef className="w-4 h-4" />} 
                        colorClass="text-brand-moss"
                      />
                      <IngredientGroup 
                        title="Bumbu & Lainnya" 
                        items={recipe.analysis?.spices} 
                        icon={<SaltIcon className="w-4 h-4" />} 
                        colorClass="text-natural-muted"
                      />
                    </div>
                  </div>

                  <div className="mt-auto p-5 bg-natural-border-soft/50 rounded-2xl border border-natural-border-soft">
                    <p className="text-[11px] leading-relaxed text-natural-muted italic">
                      {recipe.analysis.notes || "* Catatan: Kami mengasumsikan Anda memiliki garam dan minyak di dapur."}
                    </p>
                  </div>
                </aside>

                {/* Content Section */}
                <section className="flex-1 p-6 sm:p-12 bg-white">
                  <header className="mb-8 sm:mb-12 text-center md:text-left">
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 sm:gap-4 mb-6">
                      <span className="bg-natural-bg px-4 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold text-natural-muted border border-natural-border flex items-center gap-2 lowercase">
                        <Timer className="w-3.5 h-3.5" /> {recipe.estimation.time}
                      </span>
                      <span className="bg-natural-bg px-4 sm:px-5 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold text-natural-muted border border-natural-border flex items-center gap-2 lowercase">
                        <Flame className="w-3.5 h-3.5" /> {recipe.estimation.calories}
                      </span>
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-serif font-bold text-natural-heading leading-tight mb-4 italic">
                      {recipe.menuName}
                    </h1>
                    <p className="text-natural-muted text-base sm:text-lg font-medium italic">
                      Selamat masak, Chef! Nikmati hasil kreasimu sendiri hari ini.
                    </p>
                  </header>



                  <div className="space-y-8 sm:space-y-10">
                    <div className="space-y-4 sm:space-y-6">
                      <h3 className="text-base sm:text-lg font-bold flex items-center gap-3 text-natural-heading uppercase tracking-wider">
                        <div className="w-7 h-7 bg-brand-clay rounded-full text-white text-xs flex items-center justify-center font-serif">!</div>
                        Langkah Memasak
                      </h3>
                      
                      <div className="space-y-4 sm:space-y-6">
                        {recipe.steps?.map((step, index) => (
                          <motion.div 
                            key={index}
                            className="flex gap-4 sm:gap-6 group"
                          >
                            <span className="font-serif text-brand-moss font-bold text-lg sm:text-xl opacity-40 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              {(index + 1).toString().padStart(2, '0')}.
                            </span>
                            <p className="text-natural-text leading-relaxed text-sm sm:text-[15px] pt-1 font-medium">
                              {step}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Substitutions */}
                    {recipe.substitutions && recipe.substitutions?.length > 0 && (
                      <div className="space-y-6">
                        <h3 className="text-lg font-bold flex items-center gap-3 text-natural-heading uppercase tracking-wider">
                          <div className="w-7 h-7 bg-brand-moss rounded-full text-white text-xs flex items-center justify-center font-serif">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </div>
                          Nggak ada bahannya? Ganti ini aja:
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {recipe.substitutions.map((sub, idx) => (
                            <div key={idx} className="bg-natural-sidebar p-4 rounded-2xl border border-natural-border-soft flex items-center gap-4">
                              <div className="flex-1">
                                <p className="text-[10px] uppercase font-bold text-natural-muted tracking-widest mb-1 italic">Jika Butuh:</p>
                                <p className="text-sm font-bold text-natural-heading">{sub.original}</p>
                              </div>
                              <ArrowRight className="w-4 h-4 text-brand-moss opacity-40 shrink-0" />
                              <div className="flex-1 text-right">
                                <p className="text-[10px] uppercase font-bold text-brand-moss tracking-widest mb-1 italic">Coba Ganti:</p>
                                <p className="text-sm font-bold text-brand-clay">{sub.replacement}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Anti-Mubazir Tips */}
                    <div className="bg-brand-clay-light border border-brand-clay/10 p-6 sm:p-8 rounded-3xl flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                      <div className="text-2xl sm:text-3xl">💡</div>
                      <div>
                        <h4 className="text-xs sm:text-sm font-bold text-[#4b3d3d] border-[#716a6a] mb-2 uppercase tracking-widest">Tips Biar Awet</h4>
                        <p className="text-[#7a5a4c] text-xs sm:text-sm leading-relaxed font-medium">
                          {recipe.storageTips}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* Crafted Footer */}
      <footer className="mt-20 py-10 border-t border-natural-border bg-white text-center">
        <p className="text-[10px] text-natural-muted font-bold tracking-[0.2em] uppercase italic">
          Crafted by akhna.k.aqila — Memasak Lebih Cerdas, Menghemat Lebih Banyak
        </p>
      </footer>
    </div>
  );
}

function IngredientGroup({ title, items = [], icon, colorClass }: { title: string, items?: (string | { name: string; amount: string })[], icon: React.ReactNode, colorClass?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest ${colorClass || 'text-natural-muted'}`}>
        <div className="p-1.5 rounded-lg bg-white shadow-sm border border-natural-border-soft">
          {icon}
        </div>
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item, i) => {
          const detail = typeof item === 'string' ? { name: item, amount: '' } : item;
          return (
            <div key={i} className="bg-white p-3 rounded-xl shadow-sm border border-natural-border-soft flex items-center gap-3 group hover:border-brand-moss/20 transition-colors">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center opacity-40 group-hover:opacity-100 transition-opacity bg-natural-bg ${colorClass || 'text-natural-muted'}`}>
                {icon}
              </div>
              <div className="flex flex-col">
                <span className="text-natural-text text-sm font-bold">{detail?.name || (typeof item === 'string' ? item : 'Bahan')}</span>
                {detail?.amount && <span className="text-brand-clay text-[10px] font-bold lowercase italic">{detail.amount}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
