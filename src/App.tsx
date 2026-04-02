import React, { Component, useState, useEffect, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
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
  ExternalLink,
  Calendar,
  Clock,
  TrendingUp,
  PieChart as PieChartIcon,
  Activity
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
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { cn, getAutoShift, getTodayDate, handleFirestoreError, OperationType, syncToGoogleSheet } from './utils';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
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

// Error Boundary Component
class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        if (parsedError.error && parsedError.error.includes("insufficient permissions")) {
          errorMessage = "You do not have permission to perform this action. Please check your role or contact an administrator.";
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6 border border-red-100">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Application Error</h2>
            <p className="text-gray-600">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type Section = 'dashboard' | 'production' | 'wastage' | 'breakdown' | 'pending-orders' | 'masters';

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

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
  const [wastageSearchTerm, setWastageSearchTerm] = useState('');
  const [breakdownSearchTerm, setBreakdownSearchTerm] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterShift, setFilterShift] = useState('');

  // Sidebar Responsiveness
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
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
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    if (isAuthReady && user) {
      testConnection();
    }
  }, [isAuthReady, user]);

  // Real-time listeners
  useEffect(() => {
    if (!isAuthReady || !user) return;

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
  }, [isAuthReady, user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
      showNotification('error', 'Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
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
        await syncToGoogleSheet({ ...formData, type: 'Production Update' });
        showNotification('success', 'Entry updated successfully!');
      } else {
        await addDoc(collection(db, 'production'), {
          ...formData,
          createdAt: serverTimestamp()
        });
        await syncToGoogleSheet({ ...formData, type: 'Production New' });
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
        await syncToGoogleSheet({ ...wastageForm, type: 'Wastage Update' });
        showNotification('success', 'Wastage entry updated!');
      } else {
        await addDoc(collection(db, 'wastage'), {
          ...wastageForm,
          createdAt: serverTimestamp()
        });
        await syncToGoogleSheet({ ...wastageForm, type: 'Wastage New' });
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
        await syncToGoogleSheet({ ...breakdownForm, type: 'Breakdown Update' });
        showNotification('success', 'Breakdown entry updated!');
      } else {
        await addDoc(collection(db, 'breakdown'), {
          ...breakdownForm,
          createdAt: serverTimestamp()
        });
        await syncToGoogleSheet({ ...breakdownForm, type: 'Breakdown New' });
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
          description: order.description,
        }));
      }
    } else if (formData.model && !formData.piNo) {
      const matchingOrders = pendingOrders.filter(o => o.model === formData.model);
      if (matchingOrders.length === 1) {
        setFormData(prev => ({ 
          ...prev, 
          piNo: matchingOrders[0].piNo,
          description: matchingOrders[0].description,
        }));
      }
    }
  }, [formData.piNo, formData.model, pendingOrders]);

  const stats = useMemo(() => {
    const totalProd = productionData.reduce((sum, entry) => sum + (Number(entry.productionQty) || 0), 0);
    const totalRolls = productionData.reduce((sum, entry) => sum + (Number(entry.rollQty) || 0), 0);
    const totalKgs = productionData.reduce((sum, entry) => sum + (Number(entry.rollKgs) || 0), 0);
    
    const totalBreakdownMinutes = breakdownData.reduce((sum, entry) => {
      if (!entry.startTime || !entry.endTime) return sum;
      const [startH, startM] = entry.startTime.split(':').map(Number);
      const [endH, endM] = entry.endTime.split(':').map(Number);
      let diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff < 0) diff += 24 * 60; // Handle overnight breakdown
      return sum + diff;
    }, 0);

    return { totalProd, totalRolls, totalKgs, totalBreakdownMinutes };
  }, [productionData, breakdownData]);

  const productionTrendData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();
    
    return last7Days.map(date => ({
      date: date.split('-').slice(1).join('/'),
      qty: productionData.filter(p => p.productionDate === date).reduce((sum, p) => sum + (p.productionQty || 0), 0)
    }));
  }, [productionData]);

  const wastageChartData = useMemo(() => {
    const types: Record<string, number> = {};
    wastageData.forEach(w => {
      types[w.wastageType] = (types[w.wastageType] || 0) + (w.weight || 0);
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [wastageData]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-8 border border-gray-100">
          <div className="space-y-2">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard size={32} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Production Management Pro</h1>
            <p className="text-gray-500">Sign in to manage your production records</p>
          </div>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-white border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </button>
          
          <p className="text-xs text-gray-400">
            Securely managed by Firebase Authentication
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden relative">
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col md:relative",
        isSidebarOpen ? "w-64 translate-x-0" : "w-20 -translate-x-full md:translate-x-0"
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
            active={activeSection === 'dashboard'} 
            onClick={() => setActiveSection('dashboard')} 
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

        <div className="p-4 border-t border-gray-100 space-y-4">
          <div className={cn("flex items-center gap-3", !isSidebarOpen && "justify-center")}>
            {user.photoURL ? (
              <img src={user.photoURL} className="w-8 h-8 rounded-full border border-gray-200" alt="User" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold overflow-hidden">
                <Users size={18} />
              </div>
            )}
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{user.displayName || 'User'}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
          <button 
            onClick={handleLogout}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 transition-all text-sm font-semibold",
              !isSidebarOpen && "justify-center px-0"
            )}
          >
            <LogOut size={18} />
            {isSidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="max-w-7xl mx-auto">
          <AnimatePresence>
            {notification && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={cn(
                  "fixed top-4 right-4 left-4 md:left-auto md:top-8 md:right-8 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-3",
                  notification.type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
                )}
              >
                {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <span className="font-medium">{notification.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className="p-2 bg-white border border-gray-200 rounded-lg md:hidden"
              >
                <Menu size={20} />
              </button>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight capitalize">{activeSection.replace('-', ' ')}</h2>
                <p className="text-gray-500 text-sm mt-1">Manage your production operations efficiently.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto items-start sm:items-center">
              {activeSection === 'production' && (
                <div className="w-full sm:w-64">
                  <InputGroup 
                    label="Production Date" 
                    type="date" 
                    value={formData.productionDate} 
                    onChange={v => setFormData({...formData, productionDate: v})} 
                    required 
                  />
                </div>
              )}
              {activeSection !== 'dashboard' && (
                <button 
                  onClick={exportToExcel}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm text-sm h-[42px] self-end"
                >
                  <Download size={18} />
                  <span>Export</span>
                </button>
              )}
            </div>
          </header>

        {activeSection === 'dashboard' && (
          <div className="space-y-8">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard icon={<BarChart3 className="text-blue-600" />} label="Total Production" value={stats.totalProd.toLocaleString()} color="blue" />
              <StatCard icon={<Cpu className="text-purple-600" />} label="Total Rolls" value={stats.totalRolls.toLocaleString()} color="purple" />
              <StatCard icon={<TrendingUp className="text-orange-600" />} label="Total Weight (Kgs)" value={stats.totalKgs.toLocaleString()} color="orange" />
              <StatCard icon={<Clock className="text-red-600" />} label="Breakdown Time" value={`${Math.floor(stats.totalBreakdownMinutes / 60)}h ${stats.totalBreakdownMinutes % 60}m`} color="red" />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Production Trend */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Activity size={20} className="text-blue-600" />
                    Production Trend (Last 7 Days)
                  </h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productionTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        cursor={{ fill: '#f9fafb' }}
                      />
                      <Bar dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Wastage Breakdown */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <PieChartIcon size={20} className="text-orange-600" />
                    Wastage by Type
                  </h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={wastageChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'].map((color, index) => (
                          <Cell key={`cell-${index}`} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-bold">Recent Production Entries</h3>
                <button onClick={() => setActiveSection('production')} className="text-blue-600 text-sm font-semibold hover:underline">View All</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Date</th>
                      <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Machine</th>
                      <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Model</th>
                      <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Qty</th>
                      <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {productionData.slice(0, 5).map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{entry.productionDate}</td>
                        <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium">{entry.machineNo}</td>
                        <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{entry.model}</td>
                        <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-bold">{entry.productionQty}</td>
                        <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] md:text-xs font-medium">Completed</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 p-8", activeSection === 'dashboard' && "hidden")}>
          {activeSection === 'production' && (
            <div className="space-y-12">
              <form onSubmit={handleSaveProduction} className="space-y-8">
                <div className="space-y-6">
                  {/* Row 1: 3 Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  </div>

                  {/* Row 2: 2 Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  </div>

                  {/* Row 3: 1 Column (Description) */}
                  <div className="grid grid-cols-1 gap-6">
                    <InputGroup label="Description" value={formData.description} disabled />
                  </div>

                  {/* Row 4: 3 Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <InputGroup label="Production Qty" type="number" value={formData.productionQty} onChange={v => setFormData({...formData, productionQty: Number(v)})} required />
                    <InputGroup label="Packet Qty" type="number" value={formData.packetQty} onChange={v => setFormData({...formData, packetQty: Number(v)})} />
                    <InputGroup label="Meter" type="number" value={formData.meter} onChange={v => setFormData({...formData, meter: Number(v)})} />
                  </div>

                  {/* Row 5: 3 Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <InputGroup label="Roll Kgs" type="number" value={formData.rollKgs} onChange={v => setFormData({...formData, rollKgs: Number(v)})} />
                    <InputGroup label="Roll ID" value={formData.rollId} onChange={v => setFormData({...formData, rollId: v})} />
                    <InputGroup label="Roll Qty" type="number" value={formData.rollQty} onChange={v => setFormData({...formData, rollQty: Number(v)})} />
                  </div>
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
                    <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Date</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Shift</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Machine No</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Model</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Qty</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Operator</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredData.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{entry.productionDate}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] md:text-xs font-medium",
                              entry.shift === 'Day' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {entry.shift}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium">{entry.machineNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{entry.model}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-bold">{entry.productionQty}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-gray-500">{entry.operatorId}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleEdit(entry)} className="p-1.5 md:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => handleDelete(entry.id!)} className="p-1.5 md:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={16} />
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

              <div className="mt-12 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Wastage History</h3>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search wastage..." 
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
                      value={wastageSearchTerm}
                      onChange={e => setWastageSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Date</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Shift</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Machine</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Type</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Weight</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {wastageData
                        .filter(w => 
                          w.wastageType?.toLowerCase().includes(wastageSearchTerm.toLowerCase()) ||
                          w.machineNo?.toLowerCase().includes(wastageSearchTerm.toLowerCase())
                        )
                        .map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.date}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.shift}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium">{item.machineNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.wastageType}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right font-bold">{item.weight} Kgs</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleEditWastage(item)}
                                className="p-1.5 md:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteWastage(item.id!)}
                                className="p-1.5 md:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

              <div className="mt-12 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Breakdown History</h3>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search breakdown..." 
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none"
                      value={breakdownSearchTerm}
                      onChange={e => setBreakdownSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Date</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Shift</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Machine</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Reason</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Duration</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {breakdownData
                        .filter(b => 
                          b.reason?.toLowerCase().includes(breakdownSearchTerm.toLowerCase()) ||
                          b.machineNo?.toLowerCase().includes(breakdownSearchTerm.toLowerCase())
                        )
                        .map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.date}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.shift}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium">{item.machineNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.reason}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.startTime} - {item.endTime}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleEditBreakdown(item)}
                                className="p-1.5 md:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit size={16} />
                              </button>
                              <button 
                                onClick={() => handleDeleteBreakdown(item.id!)}
                                className="p-1.5 md:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
            </div>
          )}
        </div>
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
        "w-full flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3 rounded-xl transition-all duration-200 group",
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
    blue: "bg-blue-50 border-blue-100 text-blue-600",
    purple: "bg-purple-50 border-purple-100 text-purple-600",
    orange: "bg-orange-50 border-orange-100 text-orange-600",
    red: "bg-red-50 border-red-100 text-red-600",
  };
  return (
    <div className={cn("p-4 md:p-6 rounded-2xl border flex items-center gap-3 md:gap-4 shadow-sm transition-transform hover:scale-[1.02]", colors[color as keyof typeof colors].split(' ')[0], colors[color as keyof typeof colors].split(' ')[1])}>
      <div className="p-2.5 md:p-3 bg-white rounded-xl shadow-sm">{icon}</div>
      <div>
        <p className="text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg md:text-2xl font-bold mt-0.5 md:mt-1 text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function InputGroup({ label, type = "text", value, onChange, required, disabled, className, placeholder }: { label: string, type?: string, value: any, onChange?: (v: string) => void, required?: boolean, disabled?: boolean, className?: string, placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs md:text-sm font-semibold text-gray-700 flex items-center gap-1">
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
          "w-full px-3 py-2 md:px-4 md:py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm md:text-base",
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
    <div className="space-y-1.5 relative" ref={dropdownRef}>
      <label className="text-xs md:text-sm font-semibold text-gray-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <div 
        className={cn(
          "w-full px-3 py-2 md:px-4 md:py-2.5 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer flex justify-between items-center transition-all text-sm md:text-base",
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
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
      <div className="flex items-center gap-3 text-lg font-bold text-gray-900 border-b border-gray-50 pb-4">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
        <h3>{title}</h3>
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder={placeholder}
          className="flex-1 px-3 py-2 md:px-4 md:py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm md:text-base"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if(e.key === 'Enter' && val) { onAdd(val); setVal(''); } }}
        />
        <button 
          onClick={() => { if(val) { onAdd(val); setVal(''); } }}
          className="px-3 py-2 md:px-4 md:py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-sm md:text-base shadow-sm"
        >
          Add
        </button>
      </div>
      <div className="max-h-[400px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm italic">No entries found.</div>
        ) : (
          data.map((item) => (
            <div key={item.id} className="px-4 py-3.5 flex justify-between items-center hover:bg-gray-50 transition-colors group">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-900">{item.machineNo || item.operatorId}</span>
                <span className="text-xs text-gray-500">{item.machineName || item.operatorName || 'No Name Provided'}</span>
              </div>
              <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
