export type UserRole = 'ceo' | 'ketoan' | 'thicong' | 'thumua'
export type ProjectStatus = 'active' | 'completed' | 'archived'
export type ContractType = 'vat' | 'no_vat'
export type VatRate = 'vat_10' | 'vat_8' | 'no_vat'
export type PaymentStatus = 'pending' | 'paid' | 'partial'
export type InvoiceStatus = 'has_invoice' | 'waiting' | 'no_invoice'
export type ContractStatus = 'signed' | 'not_signed'
export type RevenueStatus = 'collected' | 'pending'
export type OpexTaxType = 'deductible_vat' | 'deductible_no_vat' | 'non_deductible'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  email: string
  created_at: string
}

export interface Project {
  id: string
  name: string
  customer_name: string
  address?: string
  start_date?: string
  end_date?: string
  status: ProjectStatus
  archived_at?: string
  archived_by?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  project_id: string
  type: ContractType
  value: number
  description?: string
  created_at: string
}

export interface Category {
  id: string
  project_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface Transaction {
  id: string
  project_id: string
  contract_id?: string
  category_id?: string
  transaction_date: string
  unit: string
  description: string
  amount: number
  vat_rate: VatRate
  vat_amount: number
  invoice_status: InvoiceStatus
  invoice_number?: string
  invoice_date?: string
  supplier?: string
  is_labor: boolean
  tncn_amount: number
  actual_paid: number
  labor_contract_status: ContractStatus
  payment_status: PaymentStatus
  payment_date?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  transaction_id?: string
  changed_by?: string
  changed_at: string
  field_name: string
  old_value?: string
  new_value?: string
  user_role: UserRole
  profiles?: { full_name: string; role: UserRole }
}

export interface Revenue {
  id: string
  project_id: string
  contract_id?: string
  stage: string
  amount: number
  collected_date?: string
  payment_method: string
  status: RevenueStatus
  note?: string
  created_by?: string
  created_at: string
}

export interface OperatingCost {
  id: string
  month: number
  year: number
  description: string
  amount: number
  cost_type: string
  vat_rate: VatRate
  tax_type: OpexTaxType
  is_deductible: boolean
  note?: string
  created_by?: string
  created_at: string
  updated_at: string
}
