export interface ProductionEntry {
  id?: string;
  productionDate: string;
  shift: 'Day' | 'Night';
  machineNo: string;
  operatorId: string;
  piNo: string;
  model: string;
  description: string;
  material: string;
  thickness: string;
  productionQty: number;
  packetQty: number;
  meter: number;
  rollKgs: number;
  rollId: string;
  rollQty: number;
  createdAt: any;
}

export interface WastageEntry {
  id?: string;
  date: string;
  shift: string;
  machineNo: string;
  wastageType: string;
  weight: number;
  createdAt: any;
}

export interface BreakdownEntry {
  id?: string;
  date: string;
  shift: string;
  machineNo: string;
  startTime: string;
  endTime: string;
  reason: string;
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
  material: string;
  thickness: string;
}
