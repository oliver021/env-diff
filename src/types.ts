export interface EnvMap {
  [key: string]: string;
}

export interface DiffItem {
  key: string;
  val1: string;
  val2: string;
}

export interface DiffResult {
  missingInFile2: string[];
  missingInFile1: string[];
  differentValues: DiffItem[];
}

export type IssueType = 'leak' | 'gitignore' | 'doc-drift';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface AuditIssue {
  type: IssueType;
  ruleId: string;
  severity: IssueSeverity;
  message: string;
  details?: string;
  file?: string;
  line?: number;
  key?: string;
}

export interface MatrixCell {
  present: boolean;
  value: string;
}

export interface MatrixDiffResult {
  files: string[];
  keys: string[];
  cells: Record<string, Record<string, MatrixCell>>;
  reference: string;
}
