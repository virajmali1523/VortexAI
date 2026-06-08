import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:7377/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient, private router: Router) {
    this.initializeAuth();
  }

  private initializeAuth() {
    const token = this.getToken();
    const savedUser = localStorage.getItem('auth_user');
    if (token && savedUser) {
      try {
        this.currentUserSubject.next(JSON.parse(savedUser));
        // Verify token with backend
        this.checkAuth().subscribe();
      } catch (e) {
        this.clearAuth();
      }
    }
  }

  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getCurrentUserValue(): User | null {
    return this.currentUserSubject.value;
  }

  register(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, { email, password }).pipe(
      tap(res => this.setAuth(res))
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap(res => this.setAuth(res))
    );
  }

  logout(): Observable<any> {
    const token = this.getToken();
    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    
    return this.http.post(`${this.apiUrl}/logout`, {}, { headers }).pipe(
      catchError(() => of(null)), // Ignore errors on logout
      tap(() => {
        this.clearAuth();
        this.router.navigate(['/login']);
      })
    );
  }

  checkAuth(): Observable<boolean> {
    const token = this.getToken();
    if (!token) {
      this.clearAuth();
      return of(false);
    }

    const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
    return this.http.get<{ user: User }>(`${this.apiUrl}/me`, { headers }).pipe(
      map(res => {
        if (res && res.user) {
          this.currentUserSubject.next(res.user);
          localStorage.setItem('auth_user', JSON.stringify(res.user));
          return true;
        }
        this.clearAuth();
        return false;
      }),
      catchError(() => {
        this.clearAuth();
        return of(false);
      })
    );
  }

  private setAuth(res: AuthResponse) {
    localStorage.setItem('auth_token', res.token);
    localStorage.setItem('auth_user', JSON.stringify(res.user));
    this.currentUserSubject.next(res.user);
  }

  private clearAuth() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    this.currentUserSubject.next(null);
  }
}
