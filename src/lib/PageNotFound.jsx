import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';


export default function PageNotFound() {
    const location = useLocation();
    const pageName = location.pathname.substring(1);
    const { user, isAuthenticated, authChecked } = useAuth();
    
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
            <div className="max-w-md w-full">
                <div className="text-center space-y-6">
                    {/* 404 Error Code */}
                    <div className="space-y-2">
                        <h1 className="text-7xl font-black text-primary">404</h1>
                        <div className="mx-auto h-0.5 w-16 bg-primary"></div>
                    </div>
                    
                    {/* Main Message */}
                    <div className="space-y-3">
                        <h2 className="text-2xl font-medium text-foreground">
                            Page Not Found
                        </h2>
                        <p className="text-vapor leading-relaxed">
                            The page <span className="font-medium text-foreground">"{pageName}"</span> could not be found in this application.
                        </p>
                    </div>
                    
                    {/* Admin Note */}
                    {authChecked && isAuthenticated && user?.role === 'admin' && (
                        <div className="mt-8 rounded-xl border border-border bg-card p-4 shadow-sm">
                            <div className="flex items-start space-x-3">
                                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                                    <div className="h-2 w-2 rounded-full bg-primary"></div>
                                </div>
                                <div className="text-left space-y-1">
                                    <p className="text-sm font-medium text-foreground">Admin Note</p>
                                    <p className="text-sm text-vapor leading-relaxed">
                                        This could mean that the AI hasn't implemented this page yet. Ask it to implement it in the chat.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Action Button */}
                    <div className="pt-6">
                        <button 
                            onClick={() => window.location.href = '/'} 
                            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            Go Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
