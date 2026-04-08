import React, { useState, useEffect, useMemo } from 'react';
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
  ExternalLink,
  Calendar,
  Clock,
  TrendingUp,
  PieChart as PieChartIcon,
  Activity,
  X
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
  getDocFromServer,
  getDocs
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { cn, getAutoShift, getTodayDate, handleFirestoreError, OperationType, syncToGoogleSheet, formatDate } from './utils';
import { onAuthStateChanged } from 'firebase/auth';
import type { 
  ProductionEntry, 
  WastageEntry,
  BreakdownEntry,
  Machine, 
  Operator, 
  PendingOrder,
  Unit,
  RollEntry,
  TargetEntry
} from './types';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

// Error Boundary Component
class ErrorBoundary extends React.Component<any, any> {
  public state: any;
  public props: any;

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
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(error.message);
        if (parsedError.error && parsedError.error.includes("insufficient permissions")) {
          errorMessage = "You do not have permission to perform this action. Please check your role or contact an administrator.";
        }
      } catch (e) {
        errorMessage = error?.message || errorMessage;
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

type Section = 'dashboard' | 'roll-entry' | 'target' | 'production' | 'wastage' | 'breakdown' | 'pending-orders' | 'masters';

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  console.log("Rendering AppContent...");
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authTimeout, setAuthTimeout] = useState(false);

  // Quick Add States
  const [showQuickAddMachine, setShowQuickAddMachine] = useState(false);
  const [showQuickAddOperator, setShowQuickAddOperator] = useState(false);
  const [showQuickAddUnit, setShowQuickAddUnit] = useState(false);
  const [quickAddMachine, setQuickAddMachine] = useState({ no: '', name: '' });
  const [quickAddOperator, setQuickAddOperator] = useState({ id: '', name: '' });
  const [quickAddUnit, setQuickAddUnit] = useState('');

  // Data States
  const [productionData, setProductionData] = useState<ProductionEntry[]>([]);
  const [wastageData, setWastageData] = useState<WastageEntry[]>([]);
  const [breakdownData, setBreakdownData] = useState<BreakdownEntry[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rollData, setRollData] = useState<RollEntry[]>([]);
  const [targetData, setTargetData] = useState<TargetEntry[]>([]);

  // Form States (Roll Entry)
  const [rollForm, setRollForm] = useState<Partial<RollEntry>>({
    date: getTodayDate(),
    rollId: '',
    rollKg: 0,
  });

  // Form States (Target Entry)
  const [targetForm, setTargetForm] = useState<Partial<TargetEntry>>({
    date: getTodayDate(),
    machineNo: '',
    targetQty: 0,
  });

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
    machineSpeed: 0,
    productionQty: 0,
    packetQty: 0,
    meter: 0,
  });

  // Form States (Wastage)
  const [wastageForm, setWastageForm] = useState<Partial<WastageEntry>>({
    date: getTodayDate(),
    shift: getAutoShift(),
    machineNo: '',
    unit: 'Kgs',
    setupDamage: 0,
    printDamage: 0,
    cornerCut: 0,
    cuttingDamage: 0,
    extruderDamage: 0,
    bobinCut: 0,
    ultrasonicProblem: 0,
    hookDamage: 0,
    sampleWastage: 0,
  });

  // Form States (Breakdown)
  const [breakdownForm, setBreakdownForm] = useState<Partial<BreakdownEntry>>({
    date: getTodayDate(),
    shift: getAutoShift(),
    machineNo: '',
    unit: 'Minute',
    sizeChange: 0,
    rollChange: 0,
    waitingForJob: 0,
    noOperator: 0,
    powerCut: 0,
    machineBreakdown: 0,
    airProblem: 0,
    qualityChecked: 0,
    sampleProductionTime: '',
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWastageId, setEditingWastageId] = useState<string | null>(null);
  const [editingBreakdownId, setEditingBreakdownId] = useState<string | null>(null);
  const [editingRollId, setEditingRollId] = useState<string | null>(null);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [wastageSearchTerm, setWastageSearchTerm] = useState('');
  const [breakdownSearchTerm, setBreakdownSearchTerm] = useState('');
  const [rollSearchTerm, setRollSearchTerm] = useState('');
  const [targetSearchTerm, setTargetSearchTerm] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [startDate, setStartDate] = useState(getTodayDate());
  const [endDate, setEndDate] = useState(getTodayDate());

  const filteredProduction = useMemo(() => {
    return productionData.filter(entry => {
      const date = entry.productionDate;
      const matchesDate = date >= startDate && date <= endDate;
      const matchesSearch = entry.machineNo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           entry.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           entry.operatorId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           entry.piNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (entry.rollId && entry.rollId.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // If a machine is selected in the entry form, filter by it. 
      // Otherwise, use the filterMachine dropdown value.
      const effectiveMachineFilter = formData.machineNo || filterMachine;
      const matchesMachine = !effectiveMachineFilter || entry.machineNo === effectiveMachineFilter;
      
      const matchesShift = !filterShift || entry.shift === filterShift;
      return matchesDate && matchesSearch && matchesMachine && matchesShift;
    });
  }, [productionData, startDate, endDate, searchTerm, filterMachine, filterShift, formData.machineNo]);

  const filteredWastage = useMemo(() => {
    return wastageData.filter(entry => {
      const date = entry.date;
      const matchesDate = date >= startDate && date <= endDate;
      const matchesSearch = entry.machineNo.toLowerCase().includes(wastageSearchTerm.toLowerCase()) || 
                           entry.wastageType.toLowerCase().includes(wastageSearchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [wastageData, startDate, endDate, wastageSearchTerm]);

  const filteredBreakdown = useMemo(() => {
    return breakdownData.filter(entry => {
      const date = entry.date;
      const matchesDate = date >= startDate && date <= endDate;
      const matchesSearch = entry.machineNo.toLowerCase().includes(breakdownSearchTerm.toLowerCase()) || 
                           entry.reason.toLowerCase().includes(breakdownSearchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [breakdownData, startDate, endDate, breakdownSearchTerm]);

  const filteredRollData = useMemo(() => {
    return rollData.filter(entry => {
      const date = entry.date;
      const matchesDate = date >= startDate && date <= endDate;
      const matchesSearch = entry.rollId.toLowerCase().includes(rollSearchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [rollData, startDate, endDate, rollSearchTerm]);

  const filteredTargetData = useMemo(() => {
    return targetData.filter(entry => {
      const date = entry.date;
      const matchesDate = date >= startDate && date <= endDate;
      const matchesSearch = entry.machineNo.toLowerCase().includes(targetSearchTerm.toLowerCase());
      return matchesDate && matchesSearch;
    });
  }, [targetData, startDate, endDate, targetSearchTerm]);

  // Auto-calculate Meter in Production Form
  useEffect(() => {
    if (formData.productionQty && formData.piNo && formData.model) {
      const order = pendingOrders.find(o => o.piNo === formData.piNo && o.model === formData.model);
      if (order && order.cylinderSizeMM) {
        const calculatedMeter = (formData.productionQty * order.cylinderSizeMM) / 1000;
        if (formData.meter !== calculatedMeter) {
          setFormData(prev => ({ ...prev, meter: Number(calculatedMeter.toFixed(2)) }));
        }
      }
    }
  }, [formData.productionQty, formData.piNo, formData.model, pendingOrders]);

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

  // Sync Date across entry forms
  useEffect(() => {
    const date = formData.productionDate;
    if (date && wastageForm.date !== date) setWastageForm(prev => ({ ...prev, date }));
    if (date && breakdownForm.date !== date) setBreakdownForm(prev => ({ ...prev, date }));
  }, [formData.productionDate]);

  useEffect(() => {
    const date = wastageForm.date;
    if (date && formData.productionDate !== date) setFormData(prev => ({ ...prev, productionDate: date }));
    if (date && breakdownForm.date !== date) setBreakdownForm(prev => ({ ...prev, date }));
  }, [wastageForm.date]);

  useEffect(() => {
    const date = breakdownForm.date;
    if (date && formData.productionDate !== date) setFormData(prev => ({ ...prev, productionDate: date }));
    if (date && wastageForm.date !== date) setWastageForm(prev => ({ ...prev, date }));
  }, [breakdownForm.date]);

  // Sync Shift across entry forms
  useEffect(() => {
    const shift = formData.shift;
    if (shift && wastageForm.shift !== shift) setWastageForm(prev => ({ ...prev, shift }));
    if (shift && breakdownForm.shift !== shift) setBreakdownForm(prev => ({ ...prev, shift }));
  }, [formData.shift]);

  useEffect(() => {
    const shift = wastageForm.shift;
    if (shift && formData.shift !== shift) setFormData(prev => ({ ...prev, shift }));
    if (shift && breakdownForm.shift !== shift) setBreakdownForm(prev => ({ ...prev, shift }));
  }, [wastageForm.shift]);

  useEffect(() => {
    const shift = breakdownForm.shift;
    if (shift && formData.shift !== shift) setFormData(prev => ({ ...prev, shift }));
    if (shift && wastageForm.shift !== shift) setWastageForm(prev => ({ ...prev, shift }));
  }, [breakdownForm.shift]);

  // Sync Machine No across entry forms
  useEffect(() => {
    const machine = formData.machineNo;
    if (machine && wastageForm.machineNo !== machine) setWastageForm(prev => ({ ...prev, machineNo: machine }));
    if (machine && breakdownForm.machineNo !== machine) setBreakdownForm(prev => ({ ...prev, machineNo: machine }));
  }, [formData.machineNo]);

  useEffect(() => {
    const machine = wastageForm.machineNo;
    if (machine && formData.machineNo !== machine) setFormData(prev => ({ ...prev, machineNo: machine }));
    if (machine && breakdownForm.machineNo !== machine) setBreakdownForm(prev => ({ ...prev, machineNo: machine }));
  }, [wastageForm.machineNo]);

  useEffect(() => {
    const machine = breakdownForm.machineNo;
    if (machine && formData.machineNo !== machine) setFormData(prev => ({ ...prev, machineNo: machine }));
    if (machine && wastageForm.machineNo !== machine) setWastageForm(prev => ({ ...prev, machineNo: machine }));
  }, [breakdownForm.machineNo]);

  // Auth Listener
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isAuthReady) setAuthTimeout(true);
    }, 10000); // 10s timeout

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log("Auth state changed:", user ? "User logged in" : "No user");
      setIsAuthReady(true);
      clearTimeout(timer);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [isAuthReady]);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      console.log("Testing Firestore connection...");
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection successful!");
      } catch (error) {
        console.error("Firestore connection test failed:", error);
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    if (isAuthReady) {
      testConnection();
    }
  }, [isAuthReady]);

  // Real-time listeners
  useEffect(() => {
    if (!isAuthReady) return;

    const qProduction = query(collection(db, 'production'), orderBy('createdAt', 'desc'));
    const unsubProduction = onSnapshot(qProduction, (snapshot) => {
      console.log("Production data updated:", snapshot.size, "docs");
      setProductionData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductionEntry)));
    }, (error) => {
      console.error("Production listener error:", error);
      handleFirestoreError(error, OperationType.GET, 'production');
    });

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

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      console.log("Units data updated:", snapshot.size, "docs");
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    }, (error) => {
      console.error("Units listener error:", error);
      handleFirestoreError(error, OperationType.GET, 'units');
    });

    const unsubRolls = onSnapshot(collection(db, 'rolls'), (snapshot) => {
      setRollData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RollEntry)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'rolls'));

    const unsubTargets = onSnapshot(collection(db, 'targets'), (snapshot) => {
      setTargetData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TargetEntry)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'targets'));

    return () => {
      unsubProduction();
      unsubWastage();
      unsubBreakdown();
      unsubMachines();
      unsubOperators();
      unsubPending();
      unsubUnits();
      unsubRolls();
      unsubTargets();
    };
  }, [isAuthReady]);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving production entry:", formData);
    setIsLoading(true);

    try {
      // Duplicate check: All fields must match
      const isDuplicate = productionData.some(entry => 
        entry.id !== editingId &&
        entry.machineNo === formData.machineNo &&
        entry.productionDate === formData.productionDate &&
        entry.shift === formData.shift &&
        entry.operatorId === formData.operatorId &&
        entry.piNo === formData.piNo &&
        entry.model === formData.model &&
        entry.machineSpeed === formData.machineSpeed &&
        entry.productionQty === formData.productionQty &&
        entry.packetQty === formData.packetQty &&
        entry.meter === formData.meter
      );

      if (isDuplicate) {
        showNotification('error', 'Exact duplicate entry found! This data has already been saved.');
        setIsLoading(false);
        return;
      }

      // Prepare data for saving (exclude roll fields)
      const { rollKgs, rollId, rollQty, ...saveData } = formData;

      if (editingId) {
        await updateDoc(doc(db, 'production', editingId), {
          ...saveData,
          updatedAt: serverTimestamp()
        });
        await syncToGoogleSheet({ ...saveData, type: 'Production Update' });
        showNotification('success', 'Entry updated successfully!');
      } else {
        await addDoc(collection(db, 'production'), {
          ...saveData,
          createdAt: serverTimestamp()
        });
        await syncToGoogleSheet({ ...saveData, type: 'Production New' });
        showNotification('success', 'Entry saved successfully!');
      }

      resetForm(true);
    } catch (error) {
      console.error("Error saving production:", error);
      showNotification('error', 'Failed to save entry.');
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'production');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = (preserveContext = false) => {
    setFormData(prev => ({
      productionDate: preserveContext ? prev.productionDate : getTodayDate(),
      shift: preserveContext ? prev.shift : (getAutoShift() as 'Day' | 'Night'),
      machineNo: preserveContext ? prev.machineNo : '',
      operatorId: preserveContext ? prev.operatorId : '',
      piNo: '',
      model: '',
      description: '',
      machineSpeed: 0,
      productionQty: 0,
      packetQty: 0,
      meter: 0,
    }));
    setEditingId(null);
  };

  const handleEdit = (entry: ProductionEntry) => {
    console.log("Editing production entry:", entry.id);
    setFormData(entry);
    setEditingId(entry.id || null);
    setActiveSection('production');
  };

  const handleDelete = async (id: string) => {
    console.log("Deleting production entry:", id);
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
    console.log("Saving wastage entry:", wastageForm);
    setIsLoading(true);
    try {
      // Duplicate check: All fields must match
      const isDuplicate = wastageData.some(entry => 
        entry.id !== editingWastageId &&
        entry.date === wastageForm.date &&
        entry.shift === wastageForm.shift &&
        entry.machineNo === wastageForm.machineNo &&
        entry.unit === wastageForm.unit &&
        entry.setupDamage === wastageForm.setupDamage &&
        entry.printDamage === wastageForm.printDamage &&
        entry.cornerCut === wastageForm.cornerCut &&
        entry.cuttingDamage === wastageForm.cuttingDamage &&
        entry.extruderDamage === wastageForm.extruderDamage &&
        entry.bobinCut === wastageForm.bobinCut &&
        entry.ultrasonicProblem === wastageForm.ultrasonicProblem &&
        entry.hookDamage === wastageForm.hookDamage &&
        entry.sampleWastage === wastageForm.sampleWastage
      );

      if (isDuplicate) {
        showNotification('error', 'Exact duplicate wastage entry found!');
        setIsLoading(false);
        return;
      }

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
      setWastageForm(prev => ({
        date: prev.date,
        shift: prev.shift,
        machineNo: prev.machineNo,
        unit: prev.unit || 'Kgs',
        setupDamage: 0,
        printDamage: 0,
        cornerCut: 0,
        cuttingDamage: 0,
        extruderDamage: 0,
        bobinCut: 0,
        ultrasonicProblem: 0,
        hookDamage: 0,
        sampleWastage: 0,
      }));
      setEditingWastageId(null);
    } catch (error) {
      showNotification('error', 'Failed to save wastage.');
      handleFirestoreError(error, editingWastageId ? OperationType.UPDATE : OperationType.CREATE, 'wastage');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditWastage = (entry: WastageEntry) => {
    console.log("Editing wastage entry:", entry.id);
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

  const handleSaveRoll = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving roll entry:", rollForm);
    setIsLoading(true);
    try {
      // Duplicate check
      const isDuplicate = rollData.some(entry => 
        entry.id !== editingRollId &&
        entry.date === rollForm.date &&
        entry.rollId === rollForm.rollId &&
        entry.rollKg === rollForm.rollKg
      );

      if (isDuplicate) {
        showNotification('error', 'Exact duplicate roll entry found!');
        setIsLoading(false);
        return;
      }

      if (editingRollId) {
        await updateDoc(doc(db, 'rolls', editingRollId), {
          ...rollForm,
          updatedAt: serverTimestamp()
        });
        showNotification('success', 'Roll entry updated!');
      } else {
        await addDoc(collection(db, 'rolls'), {
          ...rollForm,
          createdAt: serverTimestamp()
        });
        showNotification('success', 'Roll entry saved!');
      }
      setRollForm({ date: getTodayDate(), rollId: '', rollKg: 0 });
      setEditingRollId(null);
    } catch (error) {
      showNotification('error', 'Failed to save roll entry.');
      handleFirestoreError(error, editingRollId ? OperationType.UPDATE : OperationType.CREATE, 'rolls');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditRoll = (entry: RollEntry) => {
    setRollForm(entry);
    setEditingRollId(entry.id || null);
  };

  const handleDeleteRoll = async (id: string) => {
    if (confirm('Are you sure you want to delete this roll entry?')) {
      try {
        await deleteDoc(doc(db, 'rolls', id));
        showNotification('success', 'Roll entry deleted!');
      } catch (error) {
        showNotification('error', 'Failed to delete roll entry.');
        handleFirestoreError(error, OperationType.DELETE, 'rolls');
      }
    }
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving target entry:", targetForm);
    setIsLoading(true);
    try {
      // Duplicate check
      const isDuplicate = targetData.some(entry => 
        entry.id !== editingTargetId &&
        entry.date === targetForm.date &&
        entry.machineNo === targetForm.machineNo &&
        entry.targetQty === targetForm.targetQty
      );

      if (isDuplicate) {
        showNotification('error', 'Exact duplicate target entry found!');
        setIsLoading(false);
        return;
      }

      if (editingTargetId) {
        await updateDoc(doc(db, 'targets', editingTargetId), {
          ...targetForm,
          updatedAt: serverTimestamp()
        });
        showNotification('success', 'Target entry updated!');
      } else {
        await addDoc(collection(db, 'targets'), {
          ...targetForm,
          createdAt: serverTimestamp()
        });
        showNotification('success', 'Target entry saved!');
      }
      setTargetForm({ date: getTodayDate(), machineNo: '', targetQty: 0 });
      setEditingTargetId(null);
    } catch (error) {
      showNotification('error', 'Failed to save target entry.');
      handleFirestoreError(error, editingTargetId ? OperationType.UPDATE : OperationType.CREATE, 'targets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTarget = (entry: TargetEntry) => {
    setTargetForm(entry);
    setEditingTargetId(entry.id || null);
  };

  const handleDeleteTarget = async (id: string) => {
    if (confirm('Are you sure you want to delete this target entry?')) {
      try {
        await deleteDoc(doc(db, 'targets', id));
        showNotification('success', 'Target entry deleted!');
      } catch (error) {
        showNotification('error', 'Failed to delete target entry.');
        handleFirestoreError(error, OperationType.DELETE, 'targets');
      }
    }
  };

  const handleSaveBreakdown = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving breakdown entry:", breakdownForm);
    setIsLoading(true);
    try {
      // Duplicate check: All fields must match
      const isDuplicate = breakdownData.some(entry => 
        entry.id !== editingBreakdownId &&
        entry.date === breakdownForm.date &&
        entry.shift === breakdownForm.shift &&
        entry.machineNo === breakdownForm.machineNo &&
        entry.unit === breakdownForm.unit &&
        entry.sizeChange === breakdownForm.sizeChange &&
        entry.rollChange === breakdownForm.rollChange &&
        entry.waitingForJob === breakdownForm.waitingForJob &&
        entry.noOperator === breakdownForm.noOperator &&
        entry.powerCut === breakdownForm.powerCut &&
        entry.machineBreakdown === breakdownForm.machineBreakdown &&
        entry.airProblem === breakdownForm.airProblem &&
        entry.qualityChecked === breakdownForm.qualityChecked &&
        entry.sampleProductionTime === breakdownForm.sampleProductionTime
      );

      if (isDuplicate) {
        showNotification('error', 'Exact duplicate breakdown entry found!');
        setIsLoading(false);
        return;
      }

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
      setBreakdownForm(prev => ({
        date: prev.date,
        shift: prev.shift,
        machineNo: prev.machineNo,
        unit: prev.unit || 'Minute',
        sizeChange: 0,
        rollChange: 0,
        waitingForJob: 0,
        noOperator: 0,
        powerCut: 0,
        machineBreakdown: 0,
        airProblem: 0,
        qualityChecked: 0,
        sampleProductionTime: '',
      }));
      setEditingBreakdownId(null);
    } catch (error) {
      showNotification('error', 'Failed to save breakdown.');
      handleFirestoreError(error, editingBreakdownId ? OperationType.UPDATE : OperationType.CREATE, 'breakdown');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditBreakdown = (entry: BreakdownEntry) => {
    console.log("Editing breakdown entry:", entry.id);
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
    console.log("Starting Excel upload for file:", file.name);

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
        // Clear old pending orders first - fetch directly from DB to ensure we get everything
        const q = query(collection(db, 'pendingOrders'));
        const snapshot = await getDocs(q);
        
        // Delete in batches of 400
        const docsToDelete = snapshot.docs;
        for (let i = 0; i < docsToDelete.length; i += 400) {
          const chunk = docsToDelete.slice(i, i + 400);
          const deleteBatch = writeBatch(db);
          chunk.forEach(doc => deleteBatch.delete(doc.ref));
          await deleteBatch.commit();
        }

        // Add new orders in chunks (Firestore batches are limited to 500 operations)
        const CHUNK_SIZE = 400;
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE);
          const addBatch = writeBatch(db);
          
          for (const order of chunk) {
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

            const newOrderRef = doc(collection(db, 'pendingOrders'));
            addBatch.set(newOrderRef, {
              piNo: getVal(['pino', 'pi', 'pinumber']),
              model: getVal(['model', 'modelno', 'modelnumber']),
              description: getVal(['description', 'desc']),
              cylinderSizeMM: Number(getVal(['cylindersizemm', 'cylindersize', 'size'])) || 0,
              createdAt: serverTimestamp()
            });
          }
          await addBatch.commit();
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
    console.log(`Exporting ${activeSection} data to Excel...`);
    let data: any[] = [];
    let fileName = '';
    
    if (activeSection === 'production') {
      data = filteredProduction;
      fileName = 'Production';
    } else if (activeSection === 'wastage') {
      data = filteredWastage;
      fileName = 'Wastage';
    } else if (activeSection === 'breakdown') {
      data = filteredBreakdown;
      fileName = 'Breakdown';
    } else {
      return;
    }
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, fileName);
    XLSX.writeFile(wb, `${fileName}_Report_${getTodayDate()}.xlsx`);
  };

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
    const totalProd = filteredProduction.reduce((sum, entry) => sum + (Number(entry.productionQty) || 0), 0);
    const totalRolls = filteredRollData.length;
    const totalKgs = filteredRollData.reduce((sum, roll) => sum + (Number(roll.rollKg) || 0), 0);
    
    const totalBreakdownMinutes = filteredBreakdown.reduce((sum, entry) => {
      return sum + 
        (Number(entry.sizeChange) || 0) +
        (Number(entry.rollChange) || 0) +
        (Number(entry.waitingForJob) || 0) +
        (Number(entry.noOperator) || 0) +
        (Number(entry.powerCut) || 0) +
        (Number(entry.machineBreakdown) || 0) +
        (Number(entry.airProblem) || 0) +
        (Number(entry.qualityChecked) || 0);
    }, 0);

    const totalWastage = filteredWastage.reduce((sum, w) => {
      return sum + 
        (Number(w.setupDamage) || 0) + 
        (Number(w.printDamage) || 0) + 
        (Number(w.cornerCut) || 0) + 
        (Number(w.cuttingDamage) || 0) + 
        (Number(w.extruderDamage) || 0) + 
        (Number(w.bobinCut) || 0) + 
        (Number(w.ultrasonicProblem) || 0) + 
        (Number(w.hookDamage) || 0) + 
        (Number(w.sampleWastage) || 0);
    }, 0);

    const totalTarget = filteredTargetData.reduce((sum, t) => sum + (Number(t.targetQty) || 0), 0);

    return { totalProd, totalRolls, totalKgs, totalBreakdownMinutes, totalWastage, totalTarget };
  }, [filteredProduction, filteredBreakdown, filteredWastage, filteredTargetData, filteredRollData]);

  const rollSummary = useMemo(() => {
    const totalRolls = filteredRollData.length;
    const totalWeight = filteredRollData.reduce((sum, roll) => sum + (roll.rollKg || 0), 0);
    return { totalRolls, totalWeight };
  }, [filteredRollData]);

  const targetSummary = useMemo(() => {
    const totalTargetQty = filteredTargetData.reduce((sum, target) => sum + (target.targetQty || 0), 0);
    const totalMachines = new Set(filteredTargetData.map(t => t.machineNo)).size;
    return { totalTargetQty, totalMachines };
  }, [filteredTargetData]);

  const breakdownSummary = useMemo(() => {
    const totals = {
      sizeChange: 0,
      rollChange: 0,
      waitingForJob: 0,
      noOperator: 0,
      powerCut: 0,
      machineBreakdown: 0,
      airProblem: 0,
      qualityChecked: 0,
      total: 0
    };

    filteredBreakdown.forEach(entry => {
      totals.sizeChange += Number(entry.sizeChange) || 0;
      totals.rollChange += Number(entry.rollChange) || 0;
      totals.waitingForJob += Number(entry.waitingForJob) || 0;
      totals.noOperator += Number(entry.noOperator) || 0;
      totals.powerCut += Number(entry.powerCut) || 0;
      totals.machineBreakdown += Number(entry.machineBreakdown) || 0;
      totals.airProblem += Number(entry.airProblem) || 0;
      totals.qualityChecked += Number(entry.qualityChecked) || 0;
    });

    totals.total = totals.sizeChange + totals.rollChange + totals.waitingForJob + 
                   totals.noOperator + totals.powerCut + totals.machineBreakdown + 
                   totals.airProblem + totals.qualityChecked;

    return { ...totals, count: filteredBreakdown.length };
  }, [filteredBreakdown]);

  const liveBreakdownTotal = useMemo(() => {
    return (Number(breakdownForm.sizeChange) || 0) +
           (Number(breakdownForm.rollChange) || 0) +
           (Number(breakdownForm.waitingForJob) || 0) +
           (Number(breakdownForm.noOperator) || 0) +
           (Number(breakdownForm.powerCut) || 0) +
           (Number(breakdownForm.machineBreakdown) || 0) +
           (Number(breakdownForm.airProblem) || 0) +
           (Number(breakdownForm.qualityChecked) || 0);
  }, [breakdownForm]);

  const liveWastageTotal = useMemo(() => {
    return (Number(wastageForm.setupDamage) || 0) +
           (Number(wastageForm.printDamage) || 0) +
           (Number(wastageForm.cornerCut) || 0) +
           (Number(wastageForm.cuttingDamage) || 0) +
           (Number(wastageForm.extruderDamage) || 0) +
           (Number(wastageForm.bobinCut) || 0) +
           (Number(wastageForm.ultrasonicProblem) || 0) +
           (Number(wastageForm.hookDamage) || 0) +
           (Number(wastageForm.sampleWastage) || 0);
  }, [wastageForm]);

  const productionSummary = useMemo(() => {
    const today = getTodayDate();
    const selectedMachine = formData.machineNo;
    
    // Filter targets for today
    let targetsForToday = targetData.filter(t => t.date === today);
    // Filter production for today
    let productionForToday = productionData.filter(p => p.productionDate === today);

    if (selectedMachine) {
      targetsForToday = targetsForToday.filter(t => t.machineNo === selectedMachine);
      productionForToday = productionForToday.filter(p => p.machineNo === selectedMachine);
    }

    // Group by machine
    const machineStats: Record<string, { target: number; production: number }> = {};

    // Initialize with targets
    targetsForToday.forEach(t => {
      if (!machineStats[t.machineNo]) {
        machineStats[t.machineNo] = { target: 0, production: 0 };
      }
      machineStats[t.machineNo].target += t.targetQty;
    });

    // Add production
    productionForToday.forEach(p => {
      if (!machineStats[p.machineNo]) {
        machineStats[p.machineNo] = { target: 0, production: 0 };
      }
      machineStats[p.machineNo].production += p.productionQty;
    });

    // If no targets or production found for selected machine, but machine is selected, show it with 0s
    if (selectedMachine && !machineStats[selectedMachine]) {
      machineStats[selectedMachine] = { target: 0, production: 0 };
    }

    return Object.entries(machineStats).map(([machineNo, stats]) => ({
      machineNo,
      target: stats.target,
      production: stats.production,
      required: Math.max(0, stats.target - stats.production),
      achievement: stats.target > 0 ? (stats.production / stats.target) * 100 : 0
    }));
  }, [targetData, productionData, formData.machineNo]);

  const productionTrendData = useMemo(() => {
    // If we have a range, we should show the range, otherwise last 7 days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const daysToShow = diffDays > 0 ? diffDays + 1 : 7;
    const dates = Array.from({ length: daysToShow }, (_, i) => {
      const d = new Date(endDate);
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();
    
    return dates.map(date => ({
      date: formatDate(date),
      qty: productionData.filter(p => p.productionDate === date).reduce((sum, p) => sum + (p.productionQty || 0), 0),
      target: targetData.filter(t => t.date === date).reduce((sum, t) => sum + (t.targetQty || 0), 0)
    }));
  }, [productionData, targetData, startDate, endDate]);

  const wastageChartData = useMemo(() => {
    const totals = {
      'Setup': 0,
      'Print': 0,
      'Corner': 0,
      'Cutting': 0,
      'Extruder': 0,
      'Bobin': 0,
      'Ultrasonic': 0,
      'Hook': 0,
      'Sample': 0,
    };
    
    filteredWastage.forEach(w => {
      totals['Setup'] += Number(w.setupDamage) || 0;
      totals['Print'] += Number(w.printDamage) || 0;
      totals['Corner'] += Number(w.cornerCut) || 0;
      totals['Cutting'] += Number(w.cuttingDamage) || 0;
      totals['Extruder'] += Number(w.extruderDamage) || 0;
      totals['Bobin'] += Number(w.bobinCut) || 0;
      totals['Ultrasonic'] += Number(w.ultrasonicProblem) || 0;
      totals['Hook'] += Number(w.hookDamage) || 0;
      totals['Sample'] += Number(w.sampleWastage) || 0;
    });
    
    return Object.entries(totals)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredWastage]);

  const handleQuickAdd = async (type: 'machine' | 'operator' | 'unit') => {
    setIsLoading(true);
    try {
      if (type === 'machine') {
        if (!quickAddMachine.no || !quickAddMachine.name) return;
        await addDoc(collection(db, 'machines'), { machineNo: quickAddMachine.no, machineName: quickAddMachine.name });
        setShowQuickAddMachine(false);
        setQuickAddMachine({ no: '', name: '' });
      } else if (type === 'operator') {
        if (!quickAddOperator.id || !quickAddOperator.name) return;
        await addDoc(collection(db, 'operators'), { operatorId: quickAddOperator.id, operatorName: quickAddOperator.name });
        setShowQuickAddOperator(false);
        setQuickAddOperator({ id: '', name: '' });
      } else if (type === 'unit') {
        if (!quickAddUnit.trim()) return;
        await addDoc(collection(db, 'units'), { name: quickAddUnit.trim() });
        setShowQuickAddUnit(false);
        setQuickAddUnit('');
      }
      showNotification('success', `${type} added successfully!`);
    } catch (error) {
      showNotification('error', `Failed to add ${type}.`);
      handleFirestoreError(error, OperationType.CREATE, type === 'unit' ? 'units' : type === 'machine' ? 'machines' : 'operators');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavClick = (section: Section) => {
    setActiveSection(section);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <Loader2 className="animate-spin text-blue-600" size={48} />
        {authTimeout && (
          <div className="text-center space-y-4 max-w-xs">
            <div className="space-y-2">
              <p className="text-gray-500 font-medium">Connecting to Firebase...</p>
              <p className="text-xs text-gray-400">If this takes too long, please check your internet connection or Firebase configuration.</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-lg text-[10px] font-mono text-gray-500 break-all text-left">
              Project ID: dataentry-d3b31
            </div>
          </div>
        )}
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
              onClick={() => handleNavClick('dashboard')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<TrendingUp size={20} />} 
              label="Target" 
              active={activeSection === 'target'} 
              onClick={() => handleNavClick('target')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<Activity size={20} />} 
              label="Roll Entry" 
              active={activeSection === 'roll-entry'} 
              onClick={() => handleNavClick('roll-entry')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<PlusCircle size={20} />} 
              label="Production Entry" 
              active={activeSection === 'production'} 
              onClick={() => handleNavClick('production')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<AlertTriangle size={20} />} 
              label="Wastage Entry" 
              active={activeSection === 'wastage'} 
              onClick={() => handleNavClick('wastage')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<History size={20} />} 
              label="Breakdown Entry" 
              active={activeSection === 'breakdown'} 
              onClick={() => handleNavClick('breakdown')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<FileSpreadsheet size={20} />} 
              label="Pending Orders" 
              active={activeSection === 'pending-orders'} 
              onClick={() => handleNavClick('pending-orders')} 
              collapsed={!isSidebarOpen}
            />
            <NavItem 
              icon={<Settings size={20} />} 
              label="Masters" 
              active={activeSection === 'masters'} 
              onClick={() => handleNavClick('masters')} 
              collapsed={!isSidebarOpen}
            />
          </nav>

        <div className="p-4 border-t border-gray-100">
          <div className={cn("flex items-center gap-3", !isSidebarOpen && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold overflow-hidden">
              <Users size={18} />
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">Public Access</p>
                <p className="text-xs text-gray-500 truncate">No login required</p>
              </div>
            )}
          </div>
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

              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto items-start sm:items-center">
              <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 px-2">
                  <Calendar size={16} className="text-gray-400" />
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={e => setStartDate(e.target.value)}
                    className="text-sm outline-none bg-transparent"
                  />
                </div>
                <div className="h-4 w-px bg-gray-200" />
                <div className="flex items-center gap-2 px-2">
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={e => setEndDate(e.target.value)}
                    className="text-sm outline-none bg-transparent"
                  />
                </div>
              </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
              <StatCard icon={<TrendingUp className="text-emerald-600" />} label="Total Target" value={stats.totalTarget.toLocaleString()} color="emerald" />
              <StatCard icon={<BarChart3 className="text-blue-600" />} label="Total Production" value={stats.totalProd.toLocaleString()} color="blue" />
              <StatCard icon={<Cpu className="text-purple-600" />} label="Total Rolls" value={stats.totalRolls.toLocaleString()} color="purple" />
              <StatCard icon={<TrendingUp className="text-orange-600" />} label="Total Weight (Kgs)" value={stats.totalKgs.toLocaleString()} color="orange" />
              <StatCard icon={<AlertTriangle className="text-amber-600" />} label="Total Wastage" value={stats.totalWastage.toLocaleString()} color="amber" />
              <StatCard icon={<Clock className="text-red-600" />} label="Breakdown Time" value={`${Math.floor(stats.totalBreakdownMinutes / 60)}h ${(stats.totalBreakdownMinutes % 60).toFixed(2)}m`} color="red" />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Production Trend */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Activity size={20} className="text-blue-600" />
                    Production Trend {startDate === endDate ? `(${formatDate(startDate)})` : `(${formatDate(startDate)} to ${formatDate(endDate)})`}
                  </h3>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={productionTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        cursor={{ fill: '#f9fafb' }}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                      <Bar name="Target" dataKey="target" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                      <Bar name="Production" dataKey="qty" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Wastage Breakdown */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <PieChartIcon size={20} className="text-orange-600" />
                    Wastage by Type {startDate === endDate ? `(${formatDate(startDate)})` : `(${formatDate(startDate)} to ${formatDate(endDate)})`}
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
                <h3 className="text-lg font-bold">Production Entries {startDate === endDate ? `(${formatDate(startDate)})` : `(${formatDate(startDate)} to ${formatDate(endDate)})`}</h3>
                <button onClick={() => handleNavClick('production')} className="text-blue-600 text-sm font-semibold hover:underline">View All</button>
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
                    {filteredProduction.slice(0, 5).map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{formatDate(entry.productionDate)}</td>
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

        <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-8", activeSection === 'dashboard' && "hidden")}>
          {activeSection === 'roll-entry' && (
            <div className="space-y-6 md:space-y-12">
              {/* Roll Summary Cards */}
              <div className="grid grid-cols-2 gap-3 md:gap-6">
                <div className="bg-white p-3 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 md:gap-6">
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-blue-50 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-600">
                    <Cpu size={20} className="md:w-7 md:h-7" />
                  </div>
                  <div>
                    <p className="text-[10px] md:text-sm font-medium text-gray-500 uppercase tracking-wider">Total Rolls</p>
                    <h4 className="text-lg md:text-3xl font-bold text-gray-900">{rollSummary.totalRolls}</h4>
                  </div>
                </div>
                <div className="bg-white p-3 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 md:gap-6">
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-emerald-50 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-600">
                    <TrendingUp size={20} className="md:w-7 md:h-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] md:text-sm font-medium text-gray-500 uppercase tracking-wider">Total Weight</p>
                    <h4 className="text-lg md:text-3xl font-bold text-gray-900 truncate">{rollSummary.totalWeight.toLocaleString()}</h4>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveRoll} className="space-y-4 md:space-y-8 bg-white p-4 md:p-8 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2 md:mb-4">
                  <PlusCircle className="text-blue-600" size={18} />
                  <h3 className="text-base md:text-lg font-bold">New Roll Entry</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  <InputGroup 
                    label="Date of Entry" 
                    type="date"
                    value={rollForm.date} 
                    onChange={v => setRollForm({...rollForm, date: v})} 
                    required 
                  />
                  <InputGroup 
                    label="Roll ID" 
                    value={rollForm.rollId} 
                    onChange={v => setRollForm({...rollForm, rollId: v})} 
                    required 
                  />
                  <InputGroup 
                    label="Roll Kg" 
                    type="number" 
                    value={rollForm.rollKg} 
                    onChange={v => setRollForm({...rollForm, rollKg: Number(v)})} 
                    required 
                  />
                </div>
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => { setRollForm({ date: getTodayDate(), rollId: '', rollKg: 0 }); setEditingRollId(null); }}
                    className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold shadow-lg shadow-blue-100 flex items-center gap-2"
                  >
                    {editingRollId ? <Edit size={18} /> : <PlusCircle size={18} />}
                    <span>{editingRollId ? 'Update Roll' : 'Save Roll'}</span>
                  </button>
                </div>
              </form>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex flex-col">
                    <h3 className="font-bold text-gray-900 text-lg">Roll Entries List</h3>
                    <p className="text-sm text-gray-500">
                      {startDate === endDate ? `Records for ${startDate}` : `Records from ${startDate} to ${endDate}`}
                    </p>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search Roll ID..." 
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={rollSearchTerm}
                      onChange={e => setRollSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Date</th>
                        <th className="px-6 py-4 font-semibold">Roll ID</th>
                        <th className="px-6 py-4 font-semibold text-right">Weight (Kg)</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRollData.map((roll) => (
                        <tr key={roll.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm">{formatDate(roll.date)}</td>
                          <td className="px-6 py-4 text-sm font-medium">{roll.rollId}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono">{roll.rollKg}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleEditRoll(roll)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => handleDeleteRoll(roll.id!)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredRollData.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">No rolls found for the selected date range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'target' && (
            <div className="space-y-6 md:space-y-12">
              {/* Target Summary Cards */}
              <div className="grid grid-cols-2 gap-3 md:gap-6">
                <div className="bg-white p-3 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 md:gap-6">
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-blue-50 rounded-xl md:rounded-2xl flex items-center justify-center text-blue-600">
                    <Settings size={20} className="md:w-7 md:h-7" />
                  </div>
                  <div>
                    <p className="text-[10px] md:text-sm font-medium text-gray-500 uppercase tracking-wider">Total Machine</p>
                    <h4 className="text-lg md:text-3xl font-bold text-gray-900">{targetSummary.totalMachines}</h4>
                  </div>
                </div>
                <div className="bg-white p-3 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 md:gap-6">
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-green-50 rounded-xl md:rounded-2xl flex items-center justify-center text-green-600">
                    <BarChart3 size={20} className="md:w-7 md:h-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] md:text-sm font-medium text-gray-500 uppercase tracking-wider">Total Target</p>
                    <h4 className="text-lg md:text-3xl font-bold text-gray-900 truncate">{targetSummary.totalTargetQty.toLocaleString()}</h4>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveTarget} className="space-y-4 md:space-y-8 bg-white p-4 md:p-8 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2 md:mb-4">
                  <PlusCircle className="text-blue-600" size={18} />
                  <h3 className="text-base md:text-lg font-bold">New Target Entry</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                  <InputGroup 
                    label="Date" 
                    type="date"
                    value={targetForm.date} 
                    onChange={v => setTargetForm({...targetForm, date: v})} 
                    required 
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      Machine No
                      <button type="button" onClick={() => setShowQuickAddMachine(true)} className="text-blue-600 hover:text-blue-700">
                        <PlusCircle size={14} />
                      </button>
                    </label>
                    <select 
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-sm"
                      value={targetForm.machineNo}
                      onChange={e => setTargetForm({...targetForm, machineNo: e.target.value})}
                      required
                    >
                      <option value="">Select Machine</option>
                      {machines.map(m => (
                        <option key={m.id} value={m.machineNo}>
                          {m.machineNo}{m.machineName && m.machineName.trim() ? ` - ${m.machineName}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <InputGroup 
                    label="Target Qty" 
                    type="number" 
                    value={targetForm.targetQty} 
                    onChange={v => setTargetForm({...targetForm, targetQty: Number(v)})} 
                    required 
                  />
                </div>
                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => { setTargetForm({ date: getTodayDate(), machineNo: '', targetQty: 0 }); setEditingTargetId(null); }}
                    className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-semibold shadow-lg shadow-blue-100 flex items-center gap-2"
                  >
                    {editingTargetId ? <Edit size={18} /> : <PlusCircle size={18} />}
                    <span>{editingTargetId ? 'Update Target' : 'Save Target'}</span>
                  </button>
                </div>
              </form>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex flex-col">
                    <h3 className="font-bold text-gray-900 text-lg">Target Entries List</h3>
                    <p className="text-sm text-gray-500">
                      {startDate === endDate ? `Records for ${startDate}` : `Records from ${startDate} to ${endDate}`}
                    </p>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search Machine No..." 
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      value={targetSearchTerm}
                      onChange={e => setTargetSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Date</th>
                        <th className="px-6 py-4 font-semibold">Machine No</th>
                        <th className="px-6 py-4 font-semibold text-right">Target Qty</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredTargetData.map((target) => (
                        <tr key={target.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm">{formatDate(target.date)}</td>
                          <td className="px-6 py-4 text-sm font-medium">{target.machineNo}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono">{target.targetQty.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleEditTarget(target)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <Edit size={16} />
                              </button>
                              <button onClick={() => handleDeleteTarget(target.id!)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredTargetData.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">No targets found for the selected date range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'production' && (
            <div className="space-y-6 md:space-y-12">
              <form onSubmit={handleSaveProduction} className="space-y-4 md:space-y-8 bg-white p-4 md:p-8 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 mb-2 md:mb-4">
                  <PlusCircle className="text-blue-600" size={18} />
                  <h3 className="text-base md:text-lg font-bold">New Production Entry</h3>
                </div>
                <div className="space-y-4 md:space-y-6">
                  {/* Row 1: 3 Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                    <SelectGroup 
                      label="Shift" 
                      value={formData.shift || ''} 
                      onChange={v => setFormData({...formData, shift: v as 'Day' | 'Night'})} 
                      options={['Day', 'Night']} 
                      required
                    />
                    <SelectGroup 
                      label="Machine No" 
                      value={formData.machineNo || ''} 
                      onChange={v => setFormData({...formData, machineNo: v})} 
                      options={machines.map(m => m.machineNo)} 
                      onQuickAdd={() => setShowQuickAddMachine(true)}
                      required
                    />
                    <SelectGroup 
                      label="Operator ID" 
                      value={formData.operatorId || ''} 
                      onChange={v => setFormData({...formData, operatorId: v})} 
                      options={operators.map(o => o.operatorId)} 
                      onQuickAdd={() => setShowQuickAddOperator(true)}
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
                      required
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
                    <InputGroup label="Description" value={formData.description} disabled type="textarea" rows={2} required />
                  </div>

                  {/* Row 4: 4 Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <InputGroup label="Machine Speed" type="number" value={formData.machineSpeed} onChange={v => setFormData({...formData, machineSpeed: Number(v)})} required />
                    <InputGroup label="Production Qty" type="number" value={formData.productionQty} onChange={v => setFormData({...formData, productionQty: Math.floor(Number(v))})} required />
                    <InputGroup label="Packet Qty" type="number" value={formData.packetQty} onChange={v => setFormData({...formData, packetQty: Math.floor(Number(v))})} required />
                    <InputGroup label="Meter" type="number" value={formData.meter} disabled required />
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-6 border-t border-gray-100">
                  <button 
                    type="button" 
                    onClick={() => resetForm(false)}
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

              {/* Production Summary Report */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-50 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Production Status Summary</h3>
                    <p className="text-sm text-gray-500">Status for {formatDate(getTodayDate())}</p>
                  </div>
                  <div className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider">
                    {formData.machineNo ? `Machine: ${formData.machineNo}` : 'All Machines'}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Machine No</th>
                        <th className="px-6 py-4 font-semibold text-right">Target</th>
                        <th className="px-6 py-4 font-semibold text-right">Production Qty</th>
                        <th className="px-6 py-4 font-semibold text-right">Require Qty</th>
                        <th className="px-6 py-4 font-semibold text-right">Achieve %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {productionSummary.map((row) => (
                        <tr key={row.machineNo} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium">{row.machineNo}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono">{row.target.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono text-blue-600 font-bold">{row.production.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-right font-mono">
                            <span className={cn(
                              "px-2 py-1 rounded-lg",
                              row.required > 0 ? "bg-orange-50 text-orange-700" : "bg-green-50 text-green-700"
                            )}>
                              {row.required.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-mono">
                            <div className="flex flex-col items-end gap-1">
                              <span className={cn(
                                "font-bold",
                                row.achievement >= 100 ? "text-green-600" : row.achievement >= 50 ? "text-blue-600" : "text-orange-600"
                              )}>
                                {row.achievement.toFixed(1)}%
                              </span>
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full transition-all duration-500",
                                    row.achievement >= 100 ? "bg-green-500" : row.achievement >= 50 ? "bg-blue-500" : "bg-orange-500"
                                  )}
                                  style={{ width: `${Math.min(100, row.achievement)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {productionSummary.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">No target or production data found for today.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6 pt-8 border-t border-gray-100">
                <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-center">
                  <h3 className="text-xl font-bold">Production History {startDate === endDate ? `(${formatDate(startDate)})` : `(${formatDate(startDate)} to ${formatDate(endDate)})`}</h3>
                  <div className="flex flex-col md:flex-row gap-4 flex-1 max-w-3xl justify-end">
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
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 text-[10px] md:text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Date</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Shift</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Machine No</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">PI No</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Model</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Description</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Speed</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Prod Qty</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Pkt Qty</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Meter</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Roll Kg</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Roll ID</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold whitespace-nowrap">Roll Qty</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Operator</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredProduction.map((entry) => (
                        <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap">{formatDate(entry.productionDate)}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] md:text-xs font-medium",
                              entry.shift === 'Day' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {entry.shift}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium whitespace-nowrap">{entry.machineNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap">{entry.piNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium whitespace-nowrap">{entry.model}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm max-w-xs truncate" title={entry.description}>{entry.description}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-mono">{entry.machineSpeed}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-bold">{entry.productionQty}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-bold">{entry.packetQty}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-mono">{entry.meter}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-mono">{entry.rollKgs}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm whitespace-nowrap">{entry.rollId}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-mono">{entry.rollQty}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-gray-500 whitespace-nowrap">{entry.operatorId}</td>
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
                      {filteredProduction.length === 0 && (
                        <tr>
                          <td colSpan={15} className="px-6 py-12 text-center text-gray-500">
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
            <div className="space-y-4 md:space-y-8">
              <div className="p-6 md:p-12 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
              <MasterSection 
                title="Machine Master" 
                icon={<Cpu size={20} />}
                data={machines}
                onAdd={async (val) => {
                  try {
                    const [no, name] = val.split('|');
                    await addDoc(collection(db, 'machines'), { machineNo: no.trim(), machineName: name?.trim() || '' });
                    showNotification('success', 'Machine added successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to add machine.');
                    handleFirestoreError(error, OperationType.CREATE, 'machines');
                  }
                }}
                onUpdate={async (id, val) => {
                  try {
                    const [no, name] = val.split('|');
                    await updateDoc(doc(db, 'machines', id), { machineNo: no.trim(), machineName: name?.trim() || '' });
                    showNotification('success', 'Machine updated successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to update machine.');
                    handleFirestoreError(error, OperationType.UPDATE, 'machines');
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
                    showNotification('success', 'Operator added successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to add operator.');
                    handleFirestoreError(error, OperationType.CREATE, 'operators');
                  }
                }}
                onUpdate={async (id, val) => {
                  try {
                    const [opId, name] = val.split('|');
                    await updateDoc(doc(db, 'operators', id), { operatorId: opId.trim(), operatorName: name?.trim() || '' });
                    showNotification('success', 'Operator updated successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to update operator.');
                    handleFirestoreError(error, OperationType.UPDATE, 'operators');
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
              <MasterSection 
                title="Unit Master" 
                icon={<FileSpreadsheet size={20} />}
                data={units.map(u => ({ id: u.id, name: u.name }))}
                onAdd={async (val) => {
                  try {
                    await addDoc(collection(db, 'units'), { name: val.trim() });
                    showNotification('success', 'Unit added successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to add unit.');
                    handleFirestoreError(error, OperationType.CREATE, 'units');
                  }
                }}
                onUpdate={async (id, val) => {
                  try {
                    await updateDoc(doc(db, 'units', id), { name: val.trim() });
                    showNotification('success', 'Unit updated successfully!');
                  } catch (error) {
                    showNotification('error', 'Failed to update unit.');
                    handleFirestoreError(error, OperationType.UPDATE, 'units');
                  }
                }}
                onDelete={async (id) => {
                  try {
                    await deleteDoc(doc(db, 'units', id));
                  } catch (error) {
                    handleFirestoreError(error, OperationType.DELETE, 'units');
                  }
                }}
                placeholder="Unit Name (e.g., Pcs, Kgs)"
              />
            </div>
          )}

          {activeSection === 'wastage' && (
            <div className="space-y-4 md:space-y-8">
              <form onSubmit={handleSaveWastage} className="space-y-4 md:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
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
                    onQuickAdd={() => setShowQuickAddMachine(true)}
                    required 
                  />
                  <SelectGroup 
                    label="Unit" 
                    value={wastageForm.unit || ''} 
                    onChange={v => setWastageForm({...wastageForm, unit: v})} 
                    options={units.map(u => u.name)} 
                    onQuickAdd={() => setShowQuickAddUnit(true)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-2 md:pt-4">
                  <InputGroup label="Setup Damage" type="number" value={wastageForm.setupDamage} onChange={v => setWastageForm({...wastageForm, setupDamage: Number(v)})} />
                  <InputGroup label="Print Damage" type="number" value={wastageForm.printDamage} onChange={v => setWastageForm({...wastageForm, printDamage: Number(v)})} />
                  <InputGroup label="Corner Cut" type="number" value={wastageForm.cornerCut} onChange={v => setWastageForm({...wastageForm, cornerCut: Number(v)})} />
                  <InputGroup label="Cutting Damage" type="number" value={wastageForm.cuttingDamage} onChange={v => setWastageForm({...wastageForm, cuttingDamage: Number(v)})} />
                  <InputGroup label="Extruder Damage" type="number" value={wastageForm.extruderDamage} onChange={v => setWastageForm({...wastageForm, extruderDamage: Number(v)})} />
                  <InputGroup label="Bobin Cut" type="number" value={wastageForm.bobinCut} onChange={v => setWastageForm({...wastageForm, bobinCut: Number(v)})} />
                  <InputGroup label="Ultrasonic Problem" type="number" value={wastageForm.ultrasonicProblem} onChange={v => setWastageForm({...wastageForm, ultrasonicProblem: Number(v)})} />
                  <InputGroup label="Hook Damage" type="number" value={wastageForm.hookDamage} onChange={v => setWastageForm({...wastageForm, hookDamage: Number(v)})} />
                  <InputGroup label="Sample Wastage" type="number" value={wastageForm.sampleWastage} onChange={v => setWastageForm({...wastageForm, sampleWastage: Number(v)})} />
                  <div className="bg-orange-50 border border-orange-100 p-3 md:p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 col-span-1 md:col-span-3">
                    <div>
                      <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Current Total Wastage</p>
                      <p className="text-lg md:text-xl font-bold text-orange-700">{liveWastageTotal.toFixed(2)} Kgs</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider">Status</p>
                      <p className="text-xs md:text-sm font-medium text-orange-700">{liveWastageTotal > 0 ? 'Ready to save' : 'Enter values'}</p>
                    </div>
                  </div>
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
                          unit: '',
                          setupDamage: 0,
                          printDamage: 0,
                          cornerCut: 0,
                          cuttingDamage: 0,
                          extruderDamage: 0,
                          bobinCut: 0,
                          ultrasonicProblem: 0,
                          hookDamage: 0,
                          sampleWastage: 0,
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
                  <h3 className="text-xl font-bold">Wastage History {startDate === endDate ? `(${formatDate(startDate)})` : `(${formatDate(startDate)} to ${formatDate(endDate)})`}</h3>
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
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Unit</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Setup</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Print</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Corner</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Cutting</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Extruder</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Bobin</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Ultra</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Hook</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Sample</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredWastage.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{formatDate(item.date)}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.shift}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium">{item.machineNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.unit}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.setupDamage}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.printDamage}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.cornerCut}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.cuttingDamage}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.extruderDamage}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.bobinCut}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.ultrasonicProblem}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.hookDamage}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.sampleWastage}</td>
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
                      {filteredWastage.length === 0 && (
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
            <div className="space-y-4 md:space-y-8">
              <form onSubmit={handleSaveBreakdown} className="space-y-4 md:space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6">
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
                    onQuickAdd={() => setShowQuickAddMachine(true)}
                    required 
                  />
                  <SelectGroup 
                    label="Unit" 
                    value={breakdownForm.unit || ''} 
                    onChange={v => setBreakdownForm({...breakdownForm, unit: v})} 
                    options={units.map(u => u.name)} 
                    onQuickAdd={() => setShowQuickAddUnit(true)}
                    required 
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 pt-2 md:pt-4">
                  <InputGroup label="Size Change" type="number" value={breakdownForm.sizeChange} onChange={v => setBreakdownForm({...breakdownForm, sizeChange: Number(v)})} />
                  <InputGroup label="Roll Change" type="number" value={breakdownForm.rollChange} onChange={v => setBreakdownForm({...breakdownForm, rollChange: Number(v)})} />
                  <InputGroup label="Waiting for job" type="number" value={breakdownForm.waitingForJob} onChange={v => setBreakdownForm({...breakdownForm, waitingForJob: Number(v)})} />
                  <InputGroup label="No Operator" type="number" value={breakdownForm.noOperator} onChange={v => setBreakdownForm({...breakdownForm, noOperator: Number(v)})} />
                  <InputGroup label="Power Cut" type="number" value={breakdownForm.powerCut} onChange={v => setBreakdownForm({...breakdownForm, powerCut: Number(v)})} />
                  <InputGroup label="Machine Breakdown" type="number" value={breakdownForm.machineBreakdown} onChange={v => setBreakdownForm({...breakdownForm, machineBreakdown: Number(v)})} />
                  <InputGroup label="Air Problem" type="number" value={breakdownForm.airProblem} onChange={v => setBreakdownForm({...breakdownForm, airProblem: Number(v)})} />
                  <InputGroup label="Quality Checked" type="number" value={breakdownForm.qualityChecked} onChange={v => setBreakdownForm({...breakdownForm, qualityChecked: Number(v)})} />
                  <InputGroup label="Sample Production Time" value={breakdownForm.sampleProductionTime} onChange={v => setBreakdownForm({...breakdownForm, sampleProductionTime: v})} />
                  <div className="bg-blue-50 border border-blue-100 p-3 md:p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 col-span-1 md:col-span-3">
                    <div>
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Current Total Breakdown</p>
                      <p className="text-lg md:text-xl font-bold text-blue-700">{Math.floor(liveBreakdownTotal / 60)}h {(liveBreakdownTotal % 60).toFixed(2)}m</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Total Minutes</p>
                      <p className="text-lg md:text-xl font-bold text-blue-700">{liveBreakdownTotal.toFixed(2)} min</p>
                    </div>
                  </div>
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
                          sizeChange: 0,
                          rollChange: 0,
                          waitingForJob: 0,
                          noOperator: 0,
                          powerCut: 0,
                          machineBreakdown: 0,
                          airProblem: 0,
                          qualityChecked: 0,
                          sampleProductionTime: '',
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

              <div className="mt-12 space-y-8">
                {/* Breakdown Summary Cards */}
                <div className="grid grid-cols-2 gap-3 md:gap-6">
                  <div className="bg-white p-3 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 md:gap-4">
                    <div className="p-2 md:p-3 bg-blue-50 rounded-xl text-blue-600">
                      <Clock size={18} className="md:w-6 md:h-6" />
                    </div>
                    <div>
                      <p className="text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">Entries</p>
                      <h4 className="text-base md:text-2xl font-bold text-gray-900">{breakdownSummary.count}</h4>
                    </div>
                  </div>
                  <div className="bg-blue-600 p-3 md:p-6 rounded-2xl shadow-lg shadow-blue-100 text-white flex items-center gap-3 md:gap-4">
                    <div className="p-2 md:p-3 bg-white/20 rounded-xl">
                      <Clock size={18} className="md:w-6 md:h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider opacity-80">Total Time</p>
                      <div className="flex items-baseline gap-1 md:gap-2 overflow-hidden">
                        <h4 className="text-base md:text-2xl font-bold truncate">{Math.floor(breakdownSummary.total / 60)}h {(breakdownSummary.total % 60).toFixed(2)}m</h4>
                        <span className="hidden sm:inline text-[10px] md:text-sm opacity-80 whitespace-nowrap">({breakdownSummary.total.toFixed(2)} min)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold">Breakdown History {startDate === endDate ? `(${formatDate(startDate)})` : `(${formatDate(startDate)} to ${formatDate(endDate)})`}</h3>
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
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold">Unit</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Size Chg</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Roll Chg</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Wait Job</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">No Op</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Power</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">M/C B/D</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Air</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Quality</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Sample</th>
                        <th className="px-3 py-2.5 md:px-6 md:py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredBreakdown.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{formatDate(item.date)}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.shift}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm font-medium">{item.machineNo}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm">{item.unit}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.sizeChange}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.rollChange}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.waitingForJob}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.noOperator}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.powerCut}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.machineBreakdown}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.airProblem}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.qualityChecked}</td>
                          <td className="px-3 py-2.5 md:px-6 md:py-4 text-xs md:text-sm text-right">{item.sampleProductionTime}</td>
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
                      {filteredBreakdown.length === 0 && (
                        <tr>
                          <td colSpan={14} className="px-6 py-12 text-center text-gray-500">No breakdown records found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
        <div className="mt-8">
          {showQuickAddMachine && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold">Quick Add Machine</h3>
              <button onClick={() => setShowQuickAddMachine(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <InputGroup label="Machine No" value={quickAddMachine.no} onChange={v => setQuickAddMachine({...quickAddMachine, no: v})} required />
              <InputGroup label="Machine Name" value={quickAddMachine.name} onChange={v => setQuickAddMachine({...quickAddMachine, name: v})} required />
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowQuickAddMachine(false)} className="px-4 py-2 text-gray-600 font-medium">Cancel</button>
                <button 
                  onClick={() => handleQuickAdd('machine')}
                  disabled={!quickAddMachine.no || !quickAddMachine.name || isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Add Machine'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showQuickAddOperator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold">Quick Add Operator</h3>
              <button onClick={() => setShowQuickAddOperator(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <InputGroup label="Operator ID" value={quickAddOperator.id} onChange={v => setQuickAddOperator({...quickAddOperator, id: v})} required />
              <InputGroup label="Operator Name" value={quickAddOperator.name} onChange={v => setQuickAddOperator({...quickAddOperator, name: v})} required />
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowQuickAddOperator(false)} className="px-4 py-2 text-gray-600 font-medium">Cancel</button>
                <button 
                  onClick={() => handleQuickAdd('operator')}
                  disabled={!quickAddOperator.id || !quickAddOperator.name || isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Add Operator'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showQuickAddUnit && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold">Quick Add Unit</h3>
              <button onClick={() => setShowQuickAddUnit(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <InputGroup label="Unit Name" value={quickAddUnit} onChange={setQuickAddUnit} required />
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setShowQuickAddUnit(false)} className="px-4 py-2 text-gray-600 font-medium">Cancel</button>
                <button 
                  onClick={() => handleQuickAdd('unit')}
                  disabled={!quickAddUnit || isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Add Unit'}
                </button>
              </div>
            </div>
          </motion.div>
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
    amber: "bg-amber-50 border-amber-100 text-amber-600",
  };
  const colorClasses = colors[color as keyof typeof colors] || colors.blue;
  return (
    <div className={cn("p-4 md:p-6 rounded-2xl border flex items-center gap-3 md:gap-4 shadow-sm transition-transform hover:scale-[1.02]", colorClasses.split(' ')[0], colorClasses.split(' ')[1])}>
      <div className="p-2.5 md:p-3 bg-white rounded-xl shadow-sm">{icon}</div>
      <div>
        <p className="text-[10px] md:text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg md:text-2xl font-bold mt-0.5 md:mt-1 text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function InputGroup({ label, type = "text", value, onChange, required, disabled, className, placeholder, rows = 3 }: { label: string, type?: string, value: any, onChange?: (v: string) => void, required?: boolean, disabled?: boolean, className?: string, placeholder?: string, rows?: number }) {
  const commonClasses = cn(
    "w-full px-3 py-2 md:px-4 md:py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm md:text-base",
    disabled && "opacity-60 cursor-not-allowed bg-gray-100",
    className
  );

  return (
    <div className="space-y-1.5">
      <label className="text-xs md:text-sm font-semibold text-gray-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {type === "textarea" ? (
        <textarea
          value={value || ''}
          onChange={e => onChange?.(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          className={cn(commonClasses, "resize-none")}
        />
      ) : (
        <input 
          type={type}
          value={value || ''}
          onChange={e => onChange?.(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className={commonClasses}
        />
      )}
    </div>
  );
}

function SelectGroup({ label, value, onChange, options, required, onQuickAdd }: { label: string, value: string, onChange: (v: string) => void, options: string[], required?: boolean, onQuickAdd?: () => void }) {
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
      <div className="flex items-center justify-between">
        <label className="text-xs md:text-sm font-semibold text-gray-700 flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
        {onQuickAdd && (
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); onQuickAdd(); }}
            className="text-blue-600 hover:text-blue-700 p-1 rounded-full hover:bg-blue-50 transition-colors"
            title={`Add new ${label}`}
          >
            <PlusCircle size={14} />
          </button>
        )}
      </div>
      <div 
        className={cn(
          "w-full px-3 py-2 md:px-4 md:py-2.5 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer flex justify-between items-center transition-all text-sm md:text-base",
          isOpen ? "ring-2 ring-blue-500 border-transparent" : "hover:border-gray-300"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={cn(
          "truncate pr-2 whitespace-nowrap",
          value ? "text-gray-900" : "text-gray-500"
        )}>
          {value || `Select ${label}`}
        </span>
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

function MasterSection({ title, icon, data, onAdd, onUpdate, onDelete, placeholder }: { title: string, icon: React.ReactNode, data: any[], onAdd: (v: string) => void, onUpdate: (id: string, v: string) => void, onDelete: (id: string) => void, placeholder: string }) {
  const [val, setVal] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    const displayValue = item.machineNo ? `${item.machineNo} | ${item.machineName}` : 
                        item.operatorId ? `${item.operatorId} | ${item.operatorName}` : 
                        item.name || '';
    setVal(displayValue);
  };

  const handleSubmit = () => {
    if (!val) return;
    if (editingId) {
      onUpdate(editingId, val);
      setEditingId(null);
    } else {
      onAdd(val);
    }
    setVal('');
  };

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
          onKeyDown={e => { if(e.key === 'Enter') handleSubmit(); }}
        />
        <button 
          onClick={handleSubmit}
          className="px-3 py-2 md:px-4 md:py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold text-sm md:text-base shadow-sm"
        >
          {editingId ? 'Update' : 'Add'}
        </button>
        {editingId && (
          <button 
            onClick={() => { setEditingId(null); setVal(''); }}
            className="px-3 py-2 md:px-4 md:py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm md:text-base shadow-sm"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="max-h-[400px] overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm italic">No entries found.</div>
        ) : (
          data.map((item) => (
            <div key={item.id} className="px-4 py-3.5 flex justify-between items-center hover:bg-gray-50 transition-colors group">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-900">{item.machineNo || item.operatorId || item.name}</span>
                <span className="text-xs text-gray-500">{item.machineName || item.operatorName || (item.name ? 'Unit' : 'No Name Provided')}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(item)} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-all">
                  <Edit size={16} />
                </button>
                <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
