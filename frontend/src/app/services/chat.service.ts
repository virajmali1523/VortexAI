import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  provider: string;
  messages?: ChatMessage[];
  updatedAt?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = 'http://localhost:7377/api';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('auth_token');
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  // Get list of all chat sessions
  getHistory(): Observable<ChatSession[]> {
    return this.http.get<ChatSession[]>(`${this.apiUrl}/history`, { headers: this.getHeaders() });
  }

  // Get details of a single session
  getSession(id: string): Observable<ChatSession> {
    return this.http.get<ChatSession>(`${this.apiUrl}/history/${id}`, { headers: this.getHeaders() });
  }

  // Save/update a session
  saveSession(session: ChatSession): Observable<ChatSession> {
    return this.http.post<ChatSession>(`${this.apiUrl}/history`, session, { headers: this.getHeaders() });
  }

  // Delete a session
  deleteSession(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/history/${id}`, { headers: this.getHeaders() });
  }

  // Get dynamic prompt suggestions based on recent history
  getSuggestions(): Observable<{ label: string; prompt: string }[]> {
    return this.http.get<{ label: string; prompt: string }[]>(`${this.apiUrl}/suggestions`, { headers: this.getHeaders() });
  }

  // Stream chat messages from backend (uses fetch and ReadableStream)
  async streamChat(
    messages: ChatMessage[],
    provider: string,
    onChunk: (text: string) => void,
    onError: (err: string) => void,
    onDone: () => void
  ): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: any = {
        'Content-Type': 'application/json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${this.apiUrl}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages, provider })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Readable stream not supported in response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Save the last incomplete line to buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // SSE format: event: done
          if (trimmed.startsWith('event: done')) {
            onDone();
            return;
          }

          // SSE format: data: {"text": "chunk"}
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            if (dataStr === '[DONE]') {
              onDone();
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                onError(parsed.error);
                return;
              }
              if (parsed.text !== undefined) {
                onChunk(parsed.text);
              }
            } catch (err) {
              console.error('Error parsing SSE event data:', dataStr, err);
            }
          }
        }
      }

      // Final flush
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text !== undefined) {
                onChunk(parsed.text);
              }
            } catch (e) {}
          }
        }
      }

      onDone();
    } catch (err: any) {
      console.error('Streaming error:', err);
      onError(err.message || 'Unknown error occurred while connecting to backend.');
    }
  }
}
