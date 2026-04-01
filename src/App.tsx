import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Trash2, 
  Edit, 
  Search, 
  Filter, 
  Download, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Settings, 
  Users, 
  Cpu, 
  Menu,
  BarChart3,
  History,
  AlertTriangle,
  FileSpreadsheet,
  ChevronDown,
  LogOut,
  ExternalLink
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from './firebase';
import { cn, getAutoShift, getTodayDate, handleFirestoreError, OperationType } from './utils';
import type { 
  ProductionEntry, 
  WastageEntry,
  BreakdownEntry,
  Machine, 
  Operator, 
  PendingOrder 
} from './types';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

type Section = 'production' | 'wastage' | 'breakdown' | 'pending-orders' | 'masters';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('production');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Data States
  const [productionData, setProductionData] = useState<ProductionEntry[]>([]);
  const [wastageData, setWastageData] = useState<WastageEntry[]>([]);
  const [breakdownData, setBreakdownData] = useState<BreakdownEntry[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);

  // Form States (Production)
  const [formData, setFormData] = useState<Partial<ProductionEntry>>({
    productionDate: getTodayDate(),
    shift: getAutoShift(),
    machineNo: '',
    operatorId: '',
    piNo: '',
    model: '',
    description: '',
    material: '',
    thickness: '',
    productionQty: 0,
    packetQty: 0,
    meter: 0,
    rollKgs: 0,
    rollId: '',
    rollQty: 0,
  });

  // Form States (Wastage)
  const [wastageForm, setWastageForm] = useState<Partial<WastageEntry>>({
    date: getTodayDate(),
    shift: getAutoShift(),
    machineNo: '',
    wastageType: '',
    weight: 0,
  });

  // Form States (Breakdown)
  const [breakdownForm, setBreakdownForm] = useState<Partial<BreakdownEntry>>({
    date: getTodayDate(),
    shift: getAutoShift(),
    machineNo: '',
    startTime: '',
    endTime: '',
    reason: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWastageId, setEditingWastageId] = useState<string | null>(null);
  const [editingBreakdownId, setEditingBreakdownId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterShift, setFilterShift] = useState('');

  // Real-time listeners
  useEffect(() => {
    console.log("Initializing auth listener...");
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      console.log("Auth state changed:", currentUser ? `User: ${currentUser.email}` : "No user");
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const qProduction = query(collection(db, 'production'), orderBy('createdAt', 'desc'));
    const unsubProduction = onSnapshot(qProduction, (snapshot) => {
      setProductionData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionEntry)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'production'));

    const unsubWastage = onSnapshot(collection(db, 'wastage'), (snapshot) => {
      setWastageData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WastageEntry)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'wastage'));

    const unsubBreakdown = onSnapshot(collection(db, 'breakdown'), (snapshot) => {
      setBreakdownData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BreakdownEntry)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'breakdown'));

    const unsubMachines = onSnapshot(collection(db, 'machines'), (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Machine)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'machines'));

    const unsubOperators = onSnapshot(collection(db, 'operators'), (snapshot) => {
      setOperators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Operator)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'operators'));

    const unsubPending = onSnapshot(collection(db, 'pendingOrders'), (snapshot) => {
      setPendingOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PendingOrder)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'pendingOrders'));

    return () => {
      unsubProduction();
      unsubWastage();
      unsubBreakdown();
      unsubMachines();
      unsubOperators();
      unsubPending();
    };
  }, [user]);

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    console.log("Login button clicked");
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      console.log("Calling signInWithPopup...");
      const result = await signInWithPopup(auth, provider);
      console.log("Sign in successful:", result.user.email);
    } catch (error: any) {
      console.error("Error signing in:", error);
      let msg = 'Failed to sign in.';
      if (error.code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked by your browser. Please allow popups for this site or open in a new tab.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        msg = 'Sign-in was cancelled.';
      } else if (error.code === 'auth/unauthorized-domain') {
        msg = 'This domain is not authorized for sign-in. Please contact the administrator.';
      } else if (error.message) {
        msg = `Error: ${error.message}`;
      }
      
      // Fallback alert for iframe visibility issues
      if (error.code === 'auth/popup-blocked') {
        window.alert(msg);
      }
      
      showNotification('error', msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
      showNotification('error', 'Failed to sign out.');
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Duplicate check: machineNo + date + shift + model
      const isDuplicate = productionData.some(entry => 
        entry.id !== editingId &&
        entry.machineNo === formData.machineNo &&
        entry.productionDate === formData.productionDate &&
        entry.shift === formData.shift &&
        entry.model === formData.model
      );

      if (isDuplicate) {
        showNotification('error', 'Duplicate entry found for this Machine, Date, Shift, and Model!');
        setIsLoading(false);
        return;
      }

      if (editingId) {
        await updateDoc(doc(db, 'production', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        showNotification('success', 'Entry updated successfully!');
      } else {
        await addDoc(collection(db, 'production'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        showNotification('success', 'Entry saved successfully!');
      }

      resetForm();
    } catch (error) {
      console.error("Error saving production:", error);
      showNotification('error', 'Failed to save entry.');
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'production');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      productionDate: getTodayDate(),
      shift: getAutoShift(),
      machineNo: '',
      operatorId: '',
      piNo: '',
      model: '',
      description: '',
      material: '',
      thickness: '',
      productionQty: 0,
      packetQty: 0,
      meter: 0,
      rollKgs: 0,
      rollId: '',
      rollQty: 0,
    });
    setEditingId(null);
  };

  const handleEdit = (entry: ProductionEntry) => {
    setFormData(entry);
    setEditingId(entry.id || null);
    setActiveSection('production');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this entry?')) {
      try {
        await deleteDoc(doc(db, 'production', id));
        showNotification('success', 'Entry deleted successfully!');
      } catch (error) {
        showNotification('error', 'Failed to delete entry.');
        handleFirestoreError(error, OperationType.DELETE, 'production');
      }
    }
  };

  const handleSaveWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (editingWastageId) {
        await updateDoc(doc(db, 'wastage', editingWastageId), {
          ...wastageForm,
          updatedAt: serverTimestamp()
        });
        showNotification('success', 'Wastage entry updated!');
      } else {
        await addDoc(collection(db, 'wastage'), {
          ...wastageForm,
          createdAt: serverTimestamp()
        });
        showNotification('success', 'Wastage entry saved!');
      }
      setWastageForm({
        date: getTodayDate(),
        shift: getAutoShift(),
        machineNo: '',
        wastageType: '',
        weight: 0,
      });
      setEditingWastageId(null);
    } catch (error) {
      showNotification('error', 'Failed to save wastage.');
      handleFirestoreError(error, editingWastageId ? OperationType.UPDATE : OperationType.CREATE, 'wastage');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditWastage = (entry: WastageEntry) => {
    setWastageForm(entry);
    setEditingWastageId(entry.id || null);
  };

  const handleDeleteWastage = async (id: string) => {
    if (confirm('Are you sure you want to delete this wastage entry?')) {
      try {
        await deleteDoc(doc(db, 'wastage', id));
        showNotification('success', 'Wastage entry deleted!');
      } catch (error) {
        showNotification('error', 'Failed to delete wastage entry.');
        handleFirestoreError(error, OperationType.DELETE, 'wastage');
      }
    }
  };

  const handleSaveBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (editingBreakdownId) {
        await updateDoc(doc(db, 'breakdown', editingBreakdownId), {
          ...breakdownForm,
          updatedAt: serverTimestamp()
        });
        showNotification('success', 'Breakdown entry updated!');
      } else {
        await addDoc(collection(db, 'breakdown'), {
          ...breakdownForm,
          createdAt: serverTimestamp()
        });
        showNotification('success', 'Breakdown entry saved!');
      }
      setBreakdownForm({
        date: getTodayDate(),
        shift: getAutoShift(),
        machineNo: '',
        startTime: '',
        endTime: '',
        reason: '',
      });
      setEditingBreakdownId(null);
    } catch (error) {
      showNotification('error', 'Failed to save breakdown.');
      handleFirestoreError(error, editingBreakdownId ? OperationType.UPDATE : OperationType.CREATE, 'breakdown');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditBreakdown = (entry: BreakdownEntry) => {
    setBreakdownForm(entry);
    setEditingBreakdownId(entry.id || null);
  };

  const handleDeleteBreakdown = async (id: string) => {
    if (confirm('Are you sure you want to delete this breakdown entry?')) {
      try {
        await deleteDoc(doc(db, 'breakdown', id));
        showNotification('success', 'Breakdown entry deleted!');
      } catch (error) {
        showNotification('error', 'Failed to delete breakdown entry.');
        handleFirestoreError(error, OperationType.DELETE, 'breakdown');
      }
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      // Use range: 1 to skip the first row and use the second row (index 1) as headers
      const data = XLSX.utils.sheet_to_json(ws, { range: 1 }) as any[];

      setIsLoading(true);
      try {
        // Clear old pending orders first
        const batch = writeBatch(db);
        pendingOrders.forEach(order => {
          batch.delete(doc(db, 'pendingOrders', order.id!));
        });
        await batch.commit();

        for (const order of data) {
          // Normalize keys to lowercase and remove all non-alphanumeric characters
          const normalizedOrder: any = {};
          Object.keys(order).forEach(key => {
            normalizedOrder[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = order[key];
          });

          const getVal = (keys: string[]) => {
            for (const k of keys) {
              if (normalizedOrder[k] !== undefined && normalizedOrder[k] !== null) {
                return String(normalizedOrder[k]);
              }
            }
            return '';
          };

          await addDoc(collection(db, 'pendingOrders'), {
            piNo: getVal(['pino', 'pi', 'pinumber']),
            model: getVal(['model', 'modelno', 'modelnumber']),
            description: getVal(['description', 'desc']),
            material: getVal(['material', 'mat']),
            thickness: getVal(['thickness', 'thick'])
          });
        }
        showNotification('success', `Uploaded ${data.length} orders!`);
      } catch (error) {
        console.error("Upload error:", error);
        showNotification('error', 'Failed to upload orders.');
        handleFirestoreError(error, OperationType.WRITE, 'pendingOrders');
      } finally {
        setIsLoading(false);
        // Reset file input
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(productionData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Production");
    XLSX.writeFile(wb, `Production_Report_${getTodayDate()}.xlsx`);
  };

  const filteredData = useMemo(() => {
    return productionData.filter(entry => {
      const matchesSearch = 
        entry.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.piNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.operatorId?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMachine = !filterMachine || entry.machineNo === filterMachine;
      const matchesShift = !filterShift || entry.shift === filterShift;

      return matchesSearch && matchesMachine && matchesShift;
    });
  }, [productionData, searchTerm, filterMachine, filterShift]);

  // Auto-fill logic
  useEffect(() => {
    if (formData.piNo && formData.model) {
      const order = pendingOrders.find(o => o.piNo === formData.piNo && o.model === formData.model);
      if (order) {
        setFormData(prev => ({
          ...prev,
          description: order.description
        }));
      }
    } else if (formData.model && !formData.piNo) {
      const matchingOrders = pendingOrders.filter(o => o.model === formData.model);
      if (matchingOrders.length === 1) {
        setFormData(prev => ({ ...prev, piNo: matchingOrders[0].piNo }));
      }
    }
  }, [formData.piNo, formData.model, pendingOrders]);

  const stats = useMemo(() => {
    const totalProd = productionData.reduce((sum, entry) => sum + (Number(entry.productionQty) || 0), 0);
    const totalRolls = productionData.reduce((sum, entry) => sum + (Number(entry.rollQty) || 0), 0);
    const totalKgs = productionData.reduce((sum, entry) => sum + (Number(entry.rollKgs) || 0), 0);
    return { totalProd, totalRolls, totalKgs };
  }, [productionData]);

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard size={32} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Production Manager</h1>
          <p className="text-gray-500 mb-8">Sign in to access your dashboard</p>
          
          <div className="space-y-4">
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
            </button>

            <div className="pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-3">Having trouble signing in?</p>
              <button
                onClick={() => window.open(window.location.href, '_blank')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center justify-center gap-2 mx-auto"
              >
                <ExternalLink size={16} />
                Open in New Tab
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col",
        isSidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && <h1 className="font-bold text-xl tracking-tight text-blue-600">PROD MAN</h1>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-gray-100 rounded-lg">
            <Menu size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Dashboard" 
            active={activeSection === 'grid-view'} 
            onClick={() => setActiveSection('grid-view')} 
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<PlusCircle size={20} />} 
            label="Production Entry" 
            active={activeSection === 'production'} 
            onClick={() => setActiveSection('production')} 
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<AlertTriangle size={20} />} 
            label="Wastage Entry" 
            active={activeSection === 'wastage'} 
            onClick={() => setActiveSection('wastage')} 
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<History size={20} />} 
            label="Breakdown Entry" 
            active={activeSection === 'breakdown'} 
            onClick={() => setActiveSection('breakdown')} 
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<FileSpreadsheet size={20} />} 
            label="Pending Orders" 
            active={activeSection === 'pending-orders'} 
            onClick={() => setActiveSection('pending-orders')} 
            collapsed={!isSidebarOpen}
          />
          <NavItem 
            icon={<Settings size={20} />} 
            label="Masters" 
            active={activeSection === 'masters'} 
            onClick={() => setActiveSection('masters')} 
            collapsed={!isSidebarOpen}
          />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className={cn("flex items-center gap-3", !isSidebarOpen && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold overflow-hidden">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (user?.displayName || user?.email || 'U').charAt(0).toUpperCase()
              )}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.displayName || 'User'}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            )}
            {isSidebarOpen && (
              <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Sign out">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <AnimatePresence>
          {notification && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={cn(
                "fixed top-8 right-8 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3",
                notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
              )}
            >
              {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="font-medium">{notification.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight capitalize">{activeSection.replace('-', ' ')}</h2>
            <p className="text-gray-500 mt-1">Manage your production operations efficiently.</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Download size={18} />
              <span>Export</span>
            </button>
          </div>
        </header>

        {/* Dashboard Summary */}
        {activeSection === 'production' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard icon={<BarChart3 className="text-blue-600" />} label="Total Production Qty" value={stats.totalProd.toLocaleString()} color="blue" />
            <StatCard icon={<Cpu className="text-purple-600" />} label="Total Rolls" value={stats.totalRolls.toLocaleString()} color="purple" />
            <StatCard icon={<Users className="text-orange-600" />} label="Total Weight (Kgs)" value={stats.totalKgs.toLocaleString()} color="orange" />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {activeSection === 'production' && (
            <div className="space-y-12">
              <form onSubmit={handleSaveProduction} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputGroup label="Production Date" type="date" value={formData.productionDate} onChange={v => setFormData({...formData, productionDate: v})} required />
                  <SelectGroup 
                    label="Shift" 
                    value={formData.shift || ''} 
                    onChange={v => setFormData({...formData, shift: v as 'Day' | 'Night'})} 
                    options={['Day', 'Night']} 
                  />
                  <SelectGroup 
                    label="Machine No" 
                    value={formData.machineNo || ''} 
                    onChange={v => setFormData({...formData, machineNo: v})} 
                    options={machines.map(m => m.machineNo)} 
                    required
                  />
                  <SelectGroup 
                    label="Operator ID" 
                    value={formData.operatorId || ''} 
                    onChange={v => setFormData({...formData, operatorId: v})} 
                    options={operators.map(o => o.operatorId)} 
                    required
                  />
                  <SelectGroup 
                    label="PI No" 
                    value={formData.piNo || ''} 
                    onChange={v => setFormData({...formData, piNo: v})} 
                    options={[...new Set(pendingOrders.map(o => o.piNo).filter(Boolean))] as string[]} 
                  />
                  <SelectGroup 
                    label="Model" 
                    value={formData.model || ''} 
                    onChange={v => setFormData({...formData, model: v})} 
                    options={[...new Set(pendingOrders.filter(o => !formData.piNo || o.piNo === formData.piNo).map(o => o.model).filter(Boolean))] as string[]} 
                    required
                  />
                  <InputGroup label="Description" value={formData.description} disabled />
                  <InputGroup label="Production Qty" type="number" value={formData.productionQty} onChange={v => setFormData({...formData, productionQty: Number(v)})} required />
                  <InputGroup label="Packet Qty" type="number" value={formData.packetQty} onChange={v => setFormData({...formData, packetQty: Number(v)})} />
                  <InputGroup label="Meter" type="number" value={formData.meter} onChange={v => setFormData({...formData, meter: Number(v)})} />
                  <InputGroup label="Roll Kgs" type="number" value={formData.rollKgs} onChange={v => setFormData({...formData, rollKgs: Number(v)})} />
                  <InputGroup label="Roll ID" value={formData.rollId} onChange={v => setFormData({...formData, rollId: v})} />
                  <InputGroup label="Roll Qty" type="number" value={formData.rollQty} onChange={v => setFormData({...formData, rollQty: Number(v)})} />
                </div>

                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={resetForm}
                    className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-md shadow-blue-100 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : editingId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>

              <div className="space-y-6 pt-8 border-t border-gray-100">
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Search by Model, PI No, or Operator..." 
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-4">
                    <FilterSelect 
                      placeholder="All Machines"
                      value={filterMachine}
                      onChange={setFilterMachine}
                      options={machines.map(m => m.machineNo)}
                      icon={<Filter size={18} />}
                    />
                    <FilterSelect 
                      placeholder="All Shifts"
                      value={filterShift}
                      onChange={setFilterShift}
                      options={['Day', 'Night']}
                    />
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Date</th>
                        <th className="px-6 py-4 font-semibold">Shift</th>
                        <th className="px-6 py-4 font-semibold">Machine No</th>
                        <th className="px-6 py-4 font-semibold">Model</th>
                        <th className="px-6 py-4 font-semibold">Qty</th>
                        <th className="px-6 py-4 font-semibold">Operator</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredData.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm">{entry.productionDate}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs font-medium",
                              entry.shift === 'Day' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {entry.shift}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium">{entry.machineNo}</td>
                          <td className="px-6 py-4 text-sm">{entry.model}</td>
                          <td className="px-6 py-4 text-sm font-bold">{entry.productionQty}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{entry.operatorId}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleEdit(entry)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <Edit size={18} />
                              </button>
                              <button onClick={() => handleDelete(entry.id!)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredData.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                            No production records found matching your filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'pending-orders' && (
            <div className="space-y-8">
              <div className="p-12 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
                <Upload size={48} className="text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold">Upload Pending Orders (Excel/CSV)</h3>
                <p className="text-gray-500 text-sm mt-2">Drag and drop or click to select file</p>
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleExcelUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeSection === 'masters' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <MasterSection 
                title="Machine Master" 
                icon={<Cpu size={20} />}
                data={machines}
                onAdd={async (val) => {
                  try {
                    const [no, name] = val.split('|');
                    await addDoc(collection(db, 'machines'), { machineNo: no.trim(), machineName: name?.trim() || '' });
                  } catch (error) {
                    handleFirestoreError(error, OperationType.CREATE, 'machines');
                  }
                }}
                onDelete={async (id) => {
                  try {
                    await deleteDoc(doc(db, 'machines', id));
                  } catch (error) {
                    handleFirestoreError(error, OperationType.DELETE, 'machines');
                  }
                }}
                placeholder="MachineNo | MachineName"
              />
              <MasterSection 
                title="Operator Master" 
                icon={<Users size={20} />}
                data={operators}
                onAdd={async (val) => {
                  try {
                    const [id, name] = val.split('|');
                    await addDoc(collection(db, 'operators'), { operatorId: id.trim(), operatorName: name?.trim() || '' });
                  } catch (error) {
                    handleFirestoreError(error, OperationType.CREATE, 'operators');
                  }
                }}
                onDelete={async (id) => {
                  try {
                    await deleteDoc(doc(db, 'operators', id));
                  } catch (error) {
                    handleFirestoreError(error, OperationType.DELETE, 'operators');
                  }
                }}
                placeholder="OperatorID | OperatorName"
              />
            </div>
          )}

          {activeSection === 'wastage' && (
            <div className="space-y-8">
              <form onSubmit={handleSaveWastage} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputGroup label="Date" type="date" value={wastageForm.date} onChange={v => setWastageForm({...wastageForm, date: v})} required />
                  <SelectGroup 
                    label="Shift" 
                    value={wastageForm.shift || ''} 
                    onChange={v => setWastageForm({...wastageForm, shift: v})} 
                    options={['Day', 'Night']} 
                  />
                  <SelectGroup 
                    label="Machine No" 
                    value={wastageForm.machineNo || ''} 
                    onChange={v => setWastageForm({...wastageForm, machineNo: v})} 
                    options={machines.map(m => m.machineNo)} 
                    required 
                  />
                  <InputGroup 
                    label="Wastage Type" 
                    value={wastageForm.wastageType || ''} 
                    onChange={v => setWastageForm({...wastageForm, wastageType: v})} 
                    placeholder="e.g., Setup, Edge Trim" 
                    required 
                  />
                  <InputGroup 
                    label="Weight (Kgs)" 
                    type="number" 
                    value={wastageForm.weight} 
                    onChange={v => setWastageForm({...wastageForm, weight: Number(v)})} 
                    required 
                  />
                </div>
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                  {editingWastageId && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditingWastageId(null);
                        setWastageForm({
                          date: getTodayDate(),
                          shift: getAutoShift(),
                          machineNo: '',
                          wastageType: '',
                          weight: 0,
                        });
                      }}
                      className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={isLoading} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-md shadow-blue-100 disabled:opacity-50">
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : editingWastageId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>

              <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Shift</th>
                      <th className="px-6 py-4 font-semibold">Machine</th>
                      <th className="px-6 py-4 font-semibold">Type</th>
                      <th className="px-6 py-4 font-semibold text-right">Weight</th>
                      <th className="px-6 py-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {wastageData.slice(0, 10).map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm">{item.date}</td>
                        <td className="px-6 py-4 text-sm">{item.shift}</td>
                        <td className="px-6 py-4 text-sm font-medium">{item.machineNo}</td>
                        <td className="px-6 py-4 text-sm">{item.wastageType}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold">{item.weight} Kgs</td>
                        <td className="px-6 py-4 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleEditWastage(item)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteWastage(item.id!)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {wastageData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No wastage records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'breakdown' && (
            <div className="space-y-8">
              <form onSubmit={handleSaveBreakdown} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <InputGroup label="Date" type="date" value={breakdownForm.date} onChange={v => setBreakdownForm({...breakdownForm, date: v})} required />
                  <SelectGroup 
                    label="Shift" 
                    value={breakdownForm.shift || ''} 
                    onChange={v => setBreakdownForm({...breakdownForm, shift: v})} 
                    options={['Day', 'Night']} 
                  />
                  <SelectGroup 
                    label="Machine No" 
                    value={breakdownForm.machineNo || ''} 
                    onChange={v => setBreakdownForm({...breakdownForm, machineNo: v})} 
                    options={machines.map(m => m.machineNo)} 
                    required 
                  />
                  <InputGroup 
                    label="Reason" 
                    value={breakdownForm.reason || ''} 
                    onChange={v => setBreakdownForm({...breakdownForm, reason: v})} 
                    placeholder="e.g., Mechanical Failure" 
                    required 
                  />
                  <InputGroup label="Start Time" type="time" value={breakdownForm.startTime} onChange={v => setBreakdownForm({...breakdownForm, startTime: v})} required />
                  <InputGroup label="End Time" type="time" value={breakdownForm.endTime} onChange={v => setBreakdownForm({...breakdownForm, endTime: v})} required />
                </div>
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                  {editingBreakdownId && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditingBreakdownId(null);
                        setBreakdownForm({
                          date: getTodayDate(),
                          shift: getAutoShift(),
                          machineNo: '',
                          startTime: '',
                          endTime: '',
                          reason: '',
                        });
                      }}
                      className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                  )}
                  <button type="submit" disabled={isLoading} className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 shadow-md shadow-blue-100 disabled:opacity-50">
                    {isLoading ? <Loader2 className="animate-spin" size={20} /> : editingBreakdownId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>

              <div className="mt-12 overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Shift</th>
                      <th className="px-6 py-4 font-semibold">Machine</th>
                      <th className="px-6 py-4 font-semibold">Reason</th>
                      <th className="px-6 py-4 font-semibold">Duration</th>
                      <th className="px-6 py-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {breakdownData.slice(0, 10).map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm">{item.date}</td>
                        <td className="px-6 py-4 text-sm">{item.shift}</td>
                        <td className="px-6 py-4 text-sm font-medium">{item.machineNo}</td>
                        <td className="px-6 py-4 text-sm">{item.reason}</td>
                        <td className="px-6 py-4 text-sm">{item.startTime} - {item.endTime}</td>
                        <td className="px-6 py-4 text-sm text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleEditBreakdown(item)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteBreakdown(item.id!)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {breakdownData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">No breakdown records found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-blue-50 text-blue-600 font-semibold shadow-sm shadow-blue-100" 
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      <span className={cn("transition-transform group-hover:scale-110", active && "scale-110")}>{icon}</span>
      {!collapsed && <span className="text-sm">{label}</span>}
    </button>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: string, color: string }) {
  const colors = {
    blue: "bg-blue-50 border-blue-100",
    purple: "bg-purple-50 border-purple-100",
    orange: "bg-orange-50 border-orange-100",
  };
  return (
    <div className={cn("p-6 rounded-2xl border flex items-center gap-4 shadow-sm", colors[color as keyof typeof colors])}>
      <div className="p-3 bg-white rounded-xl shadow-sm">{icon}</div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}

function InputGroup({ label, type = "text", value, onChange, required, disabled, className, placeholder }: { label: string, type?: string, value: any, onChange?: (v: string) => void, required?: boolean, disabled?: boolean, className?: string, placeholder?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <input 
        type={type}
        value={value || ''}
        onChange={e => onChange?.(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all",
          disabled && "opacity-60 cursor-not-allowed bg-gray-100",
          className
        )}
      />
    </div>
  );
}

function SelectGroup({ label, value, onChange, options, required }: { label: string, value: string, onChange: (v: string) => void, options: string[], required?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-2 relative" ref={dropdownRef}>
      <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <div 
        className={cn(
          "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer flex justify-between items-center transition-all",
          isOpen ? "ring-2 ring-blue-500 border-transparent" : "hover:border-gray-300"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={value ? "text-gray-900 truncate pr-2" : "text-gray-500"}>{value || `Select ${label}`}</span>
        <ChevronDown size={18} className={cn("text-gray-500 transition-transform shrink-0", isOpen && "rotate-180")} />
      </div>
      
      {/* Hidden select for native form validation */}
      <select 
        value={value}
        onChange={() => {}}
        required={required}
        className="opacity-0 absolute w-0 h-0 pointer-events-none"
        tabIndex={-1}
      >
        <option value="">Select {label}</option>
        {options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
      </select>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 flex flex-col overflow-hidden"
          >
            <div className="p-2 border-b border-gray-100 bg-gray-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder={`Search ${label}...`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-1">
              <div 
                className="px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-lg text-sm text-gray-500 transition-colors"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                  setSearchTerm('');
                }}
              >
                Clear selection
              </div>
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-500">No results found</div>
              ) : (
                filteredOptions.map((opt, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "px-3 py-2 cursor-pointer rounded-lg text-sm transition-colors",
                      value === opt 
                        ? "bg-blue-50 text-blue-700 font-medium" 
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    {opt}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterSelect({ placeholder, value, onChange, options, icon }: { placeholder: string, value: string, onChange: (v: string) => void, options: string[], icon?: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="relative min-w-[160px]" ref={dropdownRef}>
      <div 
        className={cn(
          "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer flex justify-between items-center transition-all",
          isOpen ? "ring-2 ring-blue-500 border-transparent" : "hover:border-gray-300"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
          <span className={value ? "text-gray-900 truncate" : "text-gray-500 truncate"}>{value || placeholder}</span>
        </div>
        <ChevronDown size={18} className={cn("text-gray-500 transition-transform shrink-0 ml-2", isOpen && "rotate-180")} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 flex flex-col overflow-hidden right-0"
          >
            <div className="p-2 border-b border-gray-100 bg-gray-50/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  placeholder={`Search...`}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-1">
              <div 
                className="px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-lg text-sm text-gray-500 transition-colors"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                  setSearchTerm('');
                }}
              >
                All
              </div>
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-gray-500">No results found</div>
              ) : (
                filteredOptions.map((opt, i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "px-3 py-2 cursor-pointer rounded-lg text-sm transition-colors",
                      value === opt 
                        ? "bg-blue-50 text-blue-700 font-medium" 
                        : "text-gray-700 hover:bg-gray-50"
                    )}
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                  >
                    {opt}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MasterSection({ title, icon, data, onAdd, onDelete, placeholder }: { title: string, icon: React.ReactNode, data: any[], onAdd: (v: string) => void, onDelete: (id: string) => void, placeholder: string }) {
  const [val, setVal] = useState('');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-bold">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder={placeholder}
          className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none"
          value={val}
          onChange={e => setVal(e.target.value)}
        />
        <button 
          onClick={() => { if(val) { onAdd(val); setVal(''); } }}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          Add
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
        {data.map((item) => (
          <div key={item.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
            <span className="text-sm font-medium">{item.machineNo || item.operatorId} - {item.machineName || item.operatorName}</span>
            <button onClick={() => onDelete(item.id)} className="text-red-500 hover:bg-red-50 p-1 rounded-lg">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
