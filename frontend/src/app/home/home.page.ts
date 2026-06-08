import { Component, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { IonContent, MenuController } from '@ionic/angular';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService, ChatMessage, ChatSession } from '../services/chat.service';
import { AuthService } from '../services/auth.service';
import { marked } from 'marked';
import * as Prism from 'prismjs';

// Load key Prism languages for highlighting
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markup'; // HTML/XML

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false
})
export class HomePage implements OnInit {
  @ViewChild('chatContent', { read: IonContent, static: false }) content!: IonContent;

  suggestions: { label: string; prompt: string }[] = [];
  history: ChatSession[] = [];
  messages: ChatMessage[] = [];
  currentSessionId: string = '';
  currentSessionTitle: string = 'Untitled Chat';
  activeProvider: string = 'gemini';
  userInput: string = '';
  isGenerating: boolean = false;
  isDarkMode: boolean = false;
  currentUserEmail: string = '';

  private isStopRequested: boolean = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private menuCtrl: MenuController,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef
  ) {
    this.setupMarkedRenderer();
  }

  ngOnInit() {
    this.loadHistory();
    this.initTheme();
    this.createNewChat();
    this.loadSuggestions();

    this.authService.currentUser$.subscribe(user => {
      this.currentUserEmail = user ? user.email : '';
    });
  }

  // --- Theme Init & Toggle ---
  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);
    this.applyTheme();
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme() {
    document.body.classList.toggle('dark', this.isDarkMode);
    document.body.classList.toggle('ion-palette-dark', this.isDarkMode);
  }

  // --- Setup Marked Parser ---
  private setupMarkedRenderer() {
    const renderer = new marked.Renderer();

    // Customize code block rendering to include headers and Copy button
    renderer.code = (token: any): string => {
      const code = token.text;
      const language = token.lang || 'plaintext';
      let highlighted = code;
      try {
        if (Prism.languages[language]) {
          highlighted = Prism.highlight(code, Prism.languages[language], language);
        }
      } catch (e) {
        console.warn('Prism highlighting failed for language:', language, e);
      }

      // Encode code strictly to pass safely in onclick script
      const encodedCode = encodeURIComponent(code);

      return `
        <div class="code-container">
          <div class="code-header">
            <span class="code-lang">${language}</span>
            <button class="copy-code-btn" onclick="
              navigator.clipboard.writeText(decodeURIComponent('${encodedCode}'));
              this.innerText = 'Copied!';
              this.classList.add('copied');
              setTimeout(() => {
                this.innerText = 'Copy';
                this.classList.remove('copied');
              }, 2000);
            ">Copy</button>
          </div>
          <pre class="language-${language}"><code class="language-${language}">${highlighted}</code></pre>
        </div>
      `;
    };

    marked.use({
      renderer,
      gfm: true,
      breaks: true
    });
  }

  // Sanitize Markdown HTML output
  parseMarkdown(content: string): SafeHtml {
    const html = marked.parse(content) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  // --- CRUD Chat History ---
  loadHistory() {
    this.chatService.getHistory().subscribe({
      next: (data: ChatSession[]) => {
        this.history = data;
      },
      error: (err: any) => {
        console.error('Failed to load chat history', err);
      }
    });
  }

  loadSuggestions() {
    this.chatService.getSuggestions().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.suggestions = data;
        }
      },
      error: (err) => {
        console.error('Failed to load suggestions', err);
        this.suggestions = [
          { label: 'Quicksort JS', prompt: 'Write a quicksort algorithm in JavaScript' },
          { label: 'CSS Glow Effect', prompt: 'Create a CSS code for glowing text effect' },
          { label: 'Explain SSE', prompt: 'Explain Server-Sent Events in 2 sentences' }
        ];
      }
    });
  }

  loadSession(sessionId: string) {
    this.chatService.getSession(sessionId).subscribe({
      next: (session: ChatSession) => {
        this.currentSessionId = session.id;
        this.currentSessionTitle = session.title;
        this.activeProvider = session.provider || 'gemini';
        this.messages = session.messages || [];
        this.menuCtrl.close('history-menu');
        this.scrollToBottom(300);
      },
      error: (err: any) => {
        console.error('Failed to load chat session', err);
      }
    });
  }

  createNewChat() {
    this.currentSessionId = 'session_' + Date.now();
    this.currentSessionTitle = 'New Chat';
    this.messages = [];
    this.userInput = '';
    this.isGenerating = false;
    this.menuCtrl.close('history-menu');
    this.loadSuggestions();
  }

  deleteSession(sessionId: string, event: Event) {
    event.stopPropagation();
    event.preventDefault();

    this.chatService.deleteSession(sessionId).subscribe({
      next: () => {
        this.loadHistory();
        if (this.currentSessionId === sessionId) {
          this.createNewChat();
        } else {
          this.loadSuggestions();
        }
      },
      error: (err: any) => {
        console.error('Failed to delete session', err);
      }
    });
  }

  // --- Chat Actions ---
  changeProvider(event: any) {
    // No-op (Gemini only)
  }

  prefillPrompt(prompt: string) {
    this.userInput = prompt;
    this.sendMessage();
  }

  handleEnterKey(event: any) {
    // Avoid sending on Shift+Enter in text area
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    if (!this.userInput.trim() || this.isGenerating) return;

    const userText = this.userInput.trim();
    this.userInput = '';
    this.isGenerating = true;
    this.isStopRequested = false;

    // Create a new session title from the first message if it's currently generic
    if (this.messages.length === 0) {
      this.currentSessionTitle = userText.length > 30 ? userText.substring(0, 30) + '...' : userText;
    }

    // Append user message
    this.messages.push({ role: 'user', content: userText });
    this.scrollToBottom(150);

    // Placeholder for stream response
    const assistantIndex = this.messages.length;
    this.messages.push({ role: 'assistant', content: '' });

    // Save immediate state
    this.saveCurrentSession();

    // Call service to stream response
    await this.chatService.streamChat(
      this.messages.slice(0, -1), // Send history up to now
      this.activeProvider,
      (chunk: string) => {
        if (this.isStopRequested) return;
        this.messages[assistantIndex].content += chunk;
        this.scrollToBottom(50);
        this.cdr.detectChanges(); // Refresh bindings as chunks stream in
      },
      (error: any) => {
        this.isGenerating = false;
        this.messages[assistantIndex].content = `❌ **Error:** ${error}`;
        this.saveCurrentSession();
        this.cdr.detectChanges();
      },
      () => {
        this.isGenerating = false;
        // Strip trailing whitespace
        this.messages[assistantIndex].content = this.messages[assistantIndex].content.trim();
        this.saveCurrentSession();
        this.loadHistory(); // Reload sidebar list to show latest title/time
        this.loadSuggestions(); // Load new suggestions after completing chat session update
        this.cdr.detectChanges();
      }
    );
  }

  stopGeneration() {
    this.isStopRequested = true;
    this.isGenerating = false;
    this.saveCurrentSession();
    this.loadHistory();
  }

  private saveCurrentSession() {
    const session: ChatSession = {
      id: this.currentSessionId,
      title: this.currentSessionTitle,
      provider: this.activeProvider,
      messages: this.messages
    };
    this.chatService.saveSession(session).subscribe({
      next: () => {},
      error: (err: any) => console.error('Failed to sync session to database:', err)
    });
  }

  // --- Utility Helpers ---
  scrollToBottom(duration: number = 0) {
    setTimeout(() => {
      if (this.content) {
        this.content.scrollToBottom(duration);
      }
    }, 50);
  }

  getProviderAvatar(): string {
    return '✨';
  }

  getProviderName(): string {
    return 'Gemini';
  }

  getRelativeTime(timestamp?: number): string {
    if (!timestamp) return 'Just now';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  logout() {
    this.authService.logout().subscribe();
  }
}
