export interface Profile {
  id: string;
  full_name: string | null;
  role: 'admin' | 'staff' | 'student';
}

export interface Person {
  id: string;
  full_name: string;
  roll_no: string;
  department?: string | null;
  photo_url?: string | null;
  face_descriptor?: number[] | null;
  created_at?: string;
}

export interface AttendanceRecord {
  id: string;
  person_id: string;
  date: string;
  check_in: string;
  confidence: number | null;
  person?: Person;
}

export interface MatchFaceResult {
  id: string;
  full_name: string;
  roll_no: string;
  distance: number;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  source: 'env' | 'localStorage' | 'none';
}
