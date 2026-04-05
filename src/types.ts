export interface ProductionEntry {
  id?: string;
  productionDate: string;
  shift: 'Day' | 'Night';
  machineNo: string;
  operatorId: string;
  piNo: string;
  model: string;
  description: string;
  machineSpeed: number;
  productionQty: number;
  packetQty: number;
  meter: number;
  rollKgs: number;
  rollId: string;
  rollQty: number;
  createdAt: any;
}

export interface Unit {
  id?: string;
  name: string;
}

export interface WastageEntry {
  id?: string;
  date: string;
  shift: string;
  machineNo: string;
  unit: string;
  setupDamage: number;
  printDamage: number;
  cornerCut: number;
  cuttingDamage: number;
  extruderDamage: number;
  bobinCut: number;
  ultrasonicProblem: number;
  hookDamage: number;
  sampleWastage: number;
  createdAt: any;
}

export interface BreakdownEntry {
  id?: string;
  date: string;
  shift: string;
  machineNo: string;
  unit: string;
  sizeChange: number;
  rollChange: number;
  waitingForJob: number;
  noOperator: number;
  powerCut: number;
  machineBreakdown: number;
  airProblem: number;
  qualityChecked: number;
  sampleProductionTime: string;
  createdAt: any;
}

export interface Machine {
  id?: string;
  machineNo: string;
  machineName: string;
}

export interface Operator {
  id?: string;
  operatorId: string;
  operatorName: string;
}

export interface PendingOrder {
  id?: string;
  piNo: string;
  model: string;
  description: string;
  cylinderSizeMM: number;
}

export interface RollEntry {
  id?: string;
  rollId: string;
  rollKg: number;
  createdAt: any;
}
