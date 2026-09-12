
// Auth logic for Divina Providentia Library

// Helper to get form data
function getFormData(formId) {
    const form = document.getElementById(formId);
    const formData = new FormData(form);
    return Object.fromEntries(formData.entries());
}

// Sign Up
async function handleSignUp(event) {
    event.preventDefault();

    const data = getFormData('registerForm');
    const submitBtn = document.getElementById('registerSubmitBtn');
    const originalText = submitBtn.textContent;

    submitBtn.textContent = 'Procesando...';
    submitBtn.disabled = true;

    try {
        // 1. Sign up user
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: data.email,
            password: data.password,
            options: {
                data: {
                    first_name: data.first_name,
                    last_name: data.last_name,
                    country: data.country,
                    age: parseInt(data.age),
                    message: data.message // Stored in metadata initially as backup
                }
            }
        });

        if (authError) throw authError;

        if (authData.user) {
            // 2. Create/Update Profile with additional details
            // Note: Users trigger might handle this, but we explicitly update to be sure
            const { error: profileError } = await supabaseClient
                .from('profiles')
                .update({
                    first_name: data.first_name,
                    last_name: data.last_name,
                    country: data.country,
                    age: parseInt(data.age),
                    message_to_moderators: data.message,
                    is_validated: false // Default to false
                })
                .eq('id', authData.user.id);

            // If update fails (e.g. race condition with trigger), we might want to try insert, 
            // but for now let's assume the auth trigger or upsert works. 
            // Actually, best to use upsert just in case.
            const { error: upsertError } = await supabaseClient
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    email: data.email,
                    first_name: data.first_name,
                    last_name: data.last_name,
                    country: data.country,
                    age: parseInt(data.age),
                    message_to_moderators: data.message,
                    updated_at: new Date()
                });

            if (upsertError) {
                console.error("Profile update error:", upsertError);
                // Continue anyway, auth was successful
            }

            alert('Registration complete. Your details are being reviewed by our moderators.');
            closeModal('registerModal');
            // Reload to update UI state
            window.location.reload();
        }

    } catch (error) {
        console.error('Registration error:', error);
        alert(`Sign-up failed: ${error.message}`);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Sign In
async function handleSignIn(event) {
    event.preventDefault();

    const data = getFormData('loginForm');
    const submitBtn = document.getElementById('loginSubmitBtn');
    const originalText = submitBtn.textContent;

    submitBtn.textContent = 'Iniciando...';
    submitBtn.disabled = true;

    try {
        const { data: authData, error } = await supabaseClient.auth.signInWithPassword({
            email: data.email,
            password: data.password
        });

        if (error) throw error;

        // Check validation status
        if (authData.user) {
            console.log("Logged in user:", authData.user);
            // Store notification preference for after reload
            sessionStorage.setItem('showLoginNotification', 'true');
            closeModal('loginModal');
            window.location.reload(); // Refresh to update library view
        }

    } catch (error) {
        console.error('Login error:', error);
        alert(`Sign-in failed: ${error.message}`);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Sign Out
async function handleSignOut() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
        alert('Sign-out failed');
    }
}


// UI Helpers
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    } else {
        console.error(`Modal with ID '${modalId}' not found.`);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

window.openModal = openModal;
window.closeModal = closeModal;

// Toast Notifications
function showNotification(message, icon = '🕊️') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 100);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

window.showNotification = showNotification;

// Global state for validation
window.isUserValidated = false;


// Initialize Auth UI
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabaseClient) {
        console.error('Supabase client no encontrado. Revisa supabase-config.js.');
        return;
    }

    const authButtons = document.getElementById('auth-buttons');

    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) console.error('Error al obtener la sesion:', error);

    if (session) {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        const displayName = profile?.first_name
            ? `${profile.first_name} ${profile.last_name || ''}`.trim()
            : session.user.email;

        window.isUserValidated = profile?.is_validated;

        if (sessionStorage.getItem('showLoginNotification') === 'true') {
            setTimeout(() => showNotification(`${displayName} ya se encuentra en linea`), 500);
            sessionStorage.removeItem('showLoginNotification');
        }

        if (authButtons) {
            authButtons.innerHTML = '<button onclick="handleSignOut()">Sign out</button>';
        }
    } else if (authButtons) {
        authButtons.innerHTML = `<button onclick="openModal('loginModal')">Sign in</button>`;
    }

    // Attach Event Listeners to Forms
    document.getElementById('registerForm')?.addEventListener('submit', handleSignUp);
    document.getElementById('loginForm')?.addEventListener('submit', handleSignIn);

    // Close modals on outside click
    window.onclick = function (event) {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.style.display = "none";
        }
    }
});
