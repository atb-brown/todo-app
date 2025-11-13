// Extracted script from original callback.html and adapted:
// - DOM wiring moved here instead of inline onclicks
// - select id renamed to 'statusSelect' in HTML to avoid clash with the #status div
// - Initialized on DOMContentLoaded (script is also loaded with defer)

(() => {
    'use strict';

    // Cognito Configuration (kept as in original)
    const COGNITO_DOMAIN = 'https://us-east-2bo6mlndj2.auth.us-east-2.amazoncognito.com';
    const CLIENT_ID = '5aqil3a5vju8843n1ku5ffflek';
    const REDIRECT_URI = 'https://d258q7p3bgb7ar.cloudfront.net/callback.html';

    let currentUser = null;

    // Utility: show snackbar
    function showSnackbar(message) {
        const snackbar = document.getElementById('snackbar');
        snackbar.textContent = message;
        snackbar.classList.add('show');

        setTimeout(() => {
            snackbar.classList.remove('show');
        }, 3000);
    }

    // Modal functions
    function openModal() {
        document.getElementById('modalOverlay').classList.add('show');
    }

    function closeModal() {
        document.getElementById('modalOverlay').classList.remove('show');
    }

    function closeModalOnOverlay(event) {
        if (event.target && event.target.id === 'modalOverlay') {
            closeModal();
        }
    }

    // Parse helpers
    function parseHash(hash) {
        if (!hash) return {};
        if (hash[0] === '#') hash = hash.slice(1);
        return hash.split('&').reduce(function (acc, pair) {
            const parts = pair.split('=');
            const key = decodeURIComponent(parts[0] || '').trim();
            const value = decodeURIComponent(parts[1] || '').trim();
            if (key) acc[key] = value;
            return acc;
        }, {});
    }

    function parseQuery(query) {
        if (!query) return {};
        if (query[0] === '?') query = query.slice(1);
        return query.split('&').reduce(function (acc, pair) {
            const parts = pair.split('=');
            const key = decodeURIComponent(parts[0] || '').trim();
            const value = decodeURIComponent(parts[1] || '').trim();
            if (key) acc[key] = value;
            return acc;
        }, {});
    }

    function notifyOpenerAndClose(data) {
        try {
            const message = { type: 'oauth_callback', data: data };
            if (window.opener && !window.opener.closed) {
                window.opener.postMessage(message, '*');
            } else if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
            }

            const messageEl = document.getElementById('status');
            if (messageEl) messageEl.textContent = 'Authentication complete. You may close this window.';

            setTimeout(() => {
                window.close();
            }, 700);
        } catch (err) {
            const messageEl = document.getElementById('status');
            if (messageEl) messageEl.textContent = 'Could not complete authentication: ' + (err.message || err);
            console.error('callback error', err);
        }
    }

    async function handleCallback() {
        const statusDiv = document.getElementById('status');
        const loadingCard = document.getElementById('loadingCard');
        const appCard = document.getElementById('appCard');

        // Get the authorization code (query params) or hash params
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        // Check local storage to see if the user has logged in before.
        const refreshToken = localStorage.getItem('refresh_token');

        if (error) {
            statusDiv.innerHTML = `<div class="error">Login failed: ${error}</div>`;
            return;
        }

        // If there is no code but a hash (implicit flow), post it back and close
        if (!code && window.location.hash) {
            const hashParams = parseHash(window.location.hash);
            notifyOpenerAndClose(hashParams);
            return;
        }

        if (!code && !refreshToken) {
            statusDiv.innerHTML = '<div class="error">No authorization.</div>';
            return;
        }

        try {
            // Exchange authorization code for tokens
            const tokenResponse = await getTokens(code, refreshToken);

            if (!tokenResponse.ok) {
                throw new Error(`Token exchange failed: ${tokenResponse.status}`);
            }

            const tokens = await tokenResponse.json();

            // Store tokens
            sessionStorage.setItem('id_token', tokens.id_token);
            sessionStorage.setItem('access_token', tokens.access_token);
            // If the response includes a refresh token, store it.
            if (tokens.refresh_token) {
                sessionStorage.setItem('refresh_token', tokens.refresh_token);
                localStorage.setItem('refresh_token', tokens.refresh_token);
            }

            // Decode the ID token to get user info
            const idTokenPayload = JSON.parse(atob(tokens.id_token.split('.')[1]));
            currentUser = idTokenPayload;

            // Show app interface
            loadingCard.classList.add('hidden');
            appCard.classList.remove('hidden');

            await loadTodos(currentUser.sub);

            // Display user info
            const userInfoEl = document.getElementById('userInfo');
            if (userInfoEl) {
                userInfoEl.innerHTML = `
                    <strong>Logged in as:</strong> ${idTokenPayload.email}<br>
                    <strong>User ID:</strong> ${idTokenPayload.sub}
                `;
            }

        } catch (err) {
            console.error('Error:', err);
            statusDiv.innerHTML = `<div class="error">Error: ${err.message}</div>`;
        }
    }

    async function getTokens(code, refreshToken) {
        if (refreshToken) {
            // If using refresh token, clean up URL and remove the 'code' query param.
            const windowUrl = new URL(window.location.href);
            windowUrl.searchParams.delete('code');
            window.history.replaceState({}, '', windowUrl.toString());

            // Refresh authorization.
            return await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: CLIENT_ID,
                    refresh_token: refreshToken,
                })
            });
        } else if (code) {
            return await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: CLIENT_ID,
                    code: code,
                    redirect_uri: REDIRECT_URI
                })
            });
        } else {
            return {status: "Could not retrieve authorization."}
        }
    }

    // loadTodos and related handlers
    async function loadTodos(userId) {
        const todoListDiv = document.getElementById('todoList');
        todoListDiv.innerHTML = "Loading...";

        try {
            const idToken = sessionStorage.getItem('id_token');
            if (!idToken) {
                throw new Error("Missing ID token.");
            }

            const response = await fetch(
                `https://1bwzek411a.execute-api.us-east-2.amazonaws.com/dev/todos?userId=${userId}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': idToken
                    }
                }
            );

            if (!response.ok) {
                throw new Error("Failed to load todos: " + response.status);
            }

            const httpGetResponse = await response.json();
            const todos = httpGetResponse.todos;
            renderTodos(todos);

        } catch (error) {
            console.error("Error loading todos:", error);
            todoListDiv.innerHTML = `<div class="error">Error loading todos: ${error.message}</div>`;
        }
    }

    function renderTodos(todos) {
        const todoListDiv = document.getElementById("todoList");
        if (!Array.isArray(todos) || todos.length === 0) {
            todoListDiv.innerHTML = "<p>No todos yet. Add one below!</p>";
            return;
        }

        todoListDiv.innerHTML = todos.map(todo => `
                <div class="todo-item">
                    <div class="todo-task">${escapeHtml(todo.task)}</div>
                    <div class="todo-status">
                        <select name="statusSelect" class="status-selector" data-id="${todo.todoId}">
                          <option value="TODO" ${todo.status === "TODO" ? "selected" : ""}>To do</option>
                          <option value="IN_PROGRESS" ${todo.status === "IN_PROGRESS" ? "selected" : ""}>In Progress</option>
                          <option value="DONE" ${todo.status === "DONE" ? "selected" : ""}>Done</option>
                        </select>
                    </div>
                    ${todo.details ? `<div class="todo-details">${escapeHtml(todo.details)}</div>` : ""}
                    ${todo.dueDate ? `<div class="todo-details">Due: ${escapeHtml(todo.dueDate)}</div>` : ""}
                </div>
            `).join('');

        document.querySelectorAll('.status-selector').forEach(select => {
            select.addEventListener('change', async e => {
                const todoId = e.target.dataset.id;
                const newStatus = e.target.value;
                // console.log(`todoId: ${todoId}, newStatus: ${newStatus}`);
                // console.log(`target: ${e.target}`);
                await handleStatusChange(currentUser.sub, todoId, newStatus);
            });
        });
    }

    async function handleStatusChange(userId, todoId, newStatus) {
        console.log("Selected value:", newStatus);
        await fetch(
            `https://1bwzek411a.execute-api.us-east-2.amazonaws.com/dev/todos?userId=${userId}&todoId=${todoId}&newStatus=${newStatus}`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': sessionStorage.getItem('id_token')
                }
            }
        );
    }

    // Basic escaping to avoid injecting markup from server responses
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Attach listeners (form submit, modal buttons)
    function attachEventHandlers() {
        const todoForm = document.getElementById('todoForm');
        if (todoForm) {
            todoForm.addEventListener('submit', async function (e) {
                e.preventDefault();

                const submitBtn = this.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Adding...';
                }

                try {
                    const todoData = {
                        userId: currentUser.sub,
                        task: document.getElementById('task').value,
                        details: document.getElementById('details').value,
                        status: document.getElementById('statusSelect').value
                    };

                    const dueDateValue = document.getElementById('dueDate').value;
                    if (dueDateValue) {
                        todoData.dueDate = dueDateValue;
                    }

                    const idToken = sessionStorage.getItem('id_token');
                    if (!idToken) {
                        throw new Error('Not authenticated. Please log in again.');
                    }

                    const response = await fetch('https://1bwzek411a.execute-api.us-east-2.amazonaws.com/dev/todos', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': idToken
                        },
                        body: JSON.stringify(todoData)
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(errorData.error || `Failed to create todo: ${response.status}`);
                    }

                    this.reset();
                    closeModal();
                    showSnackbar('✅ Todo created successfully!');
                    await loadTodos(currentUser.sub);
                } catch (error) {
                    console.error('Error creating todo:', error);
                    showSnackbar('❌ Error: ' + error.message);
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Add Todo';
                    }
                }
            });
        }

        const addTodoBtn = document.getElementById('addTodoBtn');
        if (addTodoBtn) addTodoBtn.addEventListener('click', openModal);

        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

        const modalOverlay = document.getElementById('modalOverlay');
        if (modalOverlay) modalOverlay.addEventListener('click', closeModalOnOverlay);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeModal();
            }
        });
    }

    // entrypoint after DOM ready
    function init() {
        attachEventHandlers();
        // Kick off callback handling (OAuth exchange, showing app, etc.)
        handleCallback();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();