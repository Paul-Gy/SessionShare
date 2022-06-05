export default `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.8.3/font/bootstrap-icons.css">
    <script src="https://cdn.jsdelivr.net/npm/vue@3.2.31/dist/vue.global.prod.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/axios@0.27.2/dist/axios.min.js" defer></script>
    <title>SessionShare</title>

    <style>
        body {
            background: #f8f8f8;
        }

        .content-box {
            background: #fff;
            border-radius: 0.8rem;
            border-width: 1px;
            padding: 0.75rem;
            box-shadow: 0 0.2rem .3rem rgba(0, 0, 0, 0.25);
        }

        .drag-active {
            background-color: #d5eaff;
            border: dashed;
        }
    </style>
</head>

<body>
<div id="app" class="container my-5">
    <h1 class="text-center">SessionShare</h1>
    <p class="text-center">Easily share files in multiple times with a single link!</p>

    <div class="text-center alert alert-warning mb-4">
        This website is still a WIP and more features will be added soon...
    </div>

    <div v-if="lastError" class="alert alert-danger alert-dismissible fade show mb-3" role="alert">
        <i class="bi bi-exclamation-circle"></i> {{ lastError }}
        <button @click="closeError" type="button" class="btn-close" aria-label="Close"></button>
    </div>

    <div v-if="session && username">
        <div class="row justify-content-center mb-4">
            <div class="col-md-6 text-center">
                <label class="form-label" for="session">Anyone with this link can access/upload/delete files from this session</label>
                <div class="input-group">
                    <input type="url" id="session" class="form-control" readonly :value="currentUrl()">

                    <button type="button" class="btn btn-primary" @click="copyLink">
                        <i v-if="linkCopied" class="bi bi-clipboard-check-fill" aria-label="Copied"></i>
                        <i v-else class="bi bi-clipboard" aria-label="Copy"></i>
                    </button>
                </div>
            </div>
        </div>

        <div class="row g-4">
            <div class="col-md-8">
                <div class="content-box mb-4">
                    <h2>Online users</h2>
                    <div class="row text-center">
                        <div v-for="user in users" class="col-lg-2 col-md-3">
                            <i class="bi bi-person-circle fs-1"></i>
                            <br>
                            {{ user }}
                        </div>
                    </div>
                </div>

                <div class="content-box" :class="dragActive ? 'drag-active' : ''" @dragover.prevent="onDragover"
                     @dragleave.prevent="onDragleave" @drop.prevent="onDrop">
                    <h2>Files</h2>
                    <div class="row text-center">
                        <div v-for="file in files" class="col-lg-2 col-md-3">
                            <a :href="'/api/sessions/' + session + '/files/' + file.name" target="_blank">
                                <i class="bi bi-file-earmark fs-1"></i>
                                <br>
                                {{ file.name }}
                            </a>
                            <br>

                            <button :disabled="loading" type="button" @click="deleteFile(file.id)"
                                    class="btn btn-danger btn-small mt-2">
                                <i class="bi bi-trash" aria-label="Delete"></i>
                            </button>
                        </div>

                        <div class="col-lg-2 col-md-3">
                            <div v-if="loading">
                                <div class="spinner-border" role="status"></div>
                                <br>
                                Loading...
                            </div>
                            <a v-else href="#" @click.prevent="clickUpload">
                                <i class="bi bi-file-earmark-plus fs-1"></i>
                                <br>
                                Upload
                                <br>
                                <small>(Or drag and drop)</small>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-md-4">
                <div class="content-box h-100">
                    <h2>Session history</h2>

                    <div class="overflow-scroll">
                        <p v-for="log in logs" class="mb-1">
                            <i class="bi bi-chevron-double-right"></i> {{ formatLogEvent(log) }}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div v-else-if="session" class="text-center">
        <div class="row justify-content-center">
            <div class="col-md-6">
                <form @submit.prevent="join">
                    <label class="form-label" for="username">Enter a username to continue</label>
                    <input v-model.trim="usernameInput" type="text" class="form-control mb-3" id="username"
                           minlength="3" maxlength="16" required>

                    <button type="submit" class="btn btn-primary rounded-pill mb-3">
                        Go
                    </button>
                </form>
            </div>
        </div>
    </div>

    <div v-else class="text-center">
        <button @click="start" type="button" class="btn btn-primary rounded-pill mb-3">
            Start a new sharing session
        </button>

        <p class="mb-4">If you already have a link you can directly open it!</p>

        <h2>Why this website ?</h2>

        <p>
            When working with several people, it is often necessary to send files to each other. There are many services
            to send a
            single file, but I haven't found one that allows you to send several files in several times without having
            to send a new
            link each time.
        </p>
    </div>

    <hr>

    <p class="text-center">
        Open source on <a href="https://github.com" target="_blank" ref="nofollow">GitHub</a> -
        Built with <i class="bi-heart text-danger" role="img"></i> in Switzerland on
        <a href="https://workers.cloudflare.com/" target="_blank" rel="nofollow">Cloudflare Workers</a>
    </p>

    <input @change="uploadFile($event.target.files)" type="file" id="fileUpload" class="d-none">
</div>

<script>
    Vue.createApp({
        data() {
            return {
                lastError: '',
                session: '',
                username: '',
                usernameInput: '',
                users: [],
                logs: [],
                files: {},
                webSocket: null,
                rejoining: false,
                loading: false,
                startTime: Date.now(),
                dragActive: false,
                linkCopied: false,
            }
        },
        mounted() {
            if (window.location.pathname !== '/') {
                this.session = window.location.pathname.substring(1)
            }
        },
        methods: {
            async start() {
                try {
                    this.loading = true

                    const response = await axios.post('/api/sessions')

                    this.session = response.data.session

                    history.pushState({}, null, '/' + this.session);
                } catch (e) {
                    this.handleError(e)
                }

                this.loading = false
            },
            join() {
                this.lastError = null

                const hostname = window.location.host;
                this.webSocket = new WebSocket("wss://" + hostname + "/api/sessions/" + this.session + "/websocket")

                this.webSocket.addEventListener("open", () => {
                    this.webSocket.send(JSON.stringify({ready: true, name: this.usernameInput}));
                    this.rejoining = false
                });

                this.webSocket.addEventListener("message", event => {
                    const data = JSON.parse(event.data);

                    if (data.error) {
                        this.handleError(data.error)
                        return
                    }

                    if (data.ready === true) {
                        this.username = this.usernameInput
                        this.files = data.files
                        this.logs = data.logs.reverse()
                        this.users = data.users
                        return
                    }

                    if (!this.username) {
                        return // Not ready yet
                    }

                    if (!data.type) {
                        this.handleError('Unknown response: ' + event.data)
                        return
                    }

                    this.logs.unshift(data)

                    while (this.logs.length > 15) {
                        this.logs.pop()
                    }

                    switch (data.type) {
                        case 'user_join':
                            if (this.users.includes(data.user)) {
                                this.users.push(data.user)
                            }
                            break
                        case 'user_leave':
                            this.users = this.users.filter(u => data.user !== u)
                            break
                        case 'file_upload':
                            this.files[data.file.id] = data.file
                            break
                        case 'file_delete':
                            const fileId = data.file.id
                            delete this.files[fileId]
                            break
                    }
                });

                this.webSocket.addEventListener("close", event => {
                    console.log("WebSocket closed, reconnecting:", event.code, event.reason);
                    this.rejoin();
                });
                this.webSocket.addEventListener("error", event => {
                    console.log("WebSocket error, reconnecting:", event);
                    this.rejoin();
                });
            },
            async rejoin() {
                if (this.rejoining) {
                    return;
                }

                this.rejoining = true;
                this.webSocket = null;

                /*let timeSinceLastJoin = Date.now() - startTime;
                if (timeSinceLastJoin < 10000) {
                    // Less than 10 seconds elapsed since last join. Pause a bit.
                    await new Promise(resolve => setTimeout(resolve, 10000 - timeSinceLastJoin));
                }*/
                this.join();
            },
            clickUpload() {
                document.getElementById('fileUpload').click()
            },
            async copyLink() {
                await navigator.clipboard.writeText(window.location.href)

                this.linkCopied = true

                setTimeout(() => {
                    this.linkCopied = false
                }, 1500)
            },
            async uploadFile(files) {
                const file = files[0]

                if (file.size > 100 * 1024 * 1024) {
                    this.handleError('Max upload size is 100 MB')
                    return
                }

                if (this.loading) {
                    return
                }

                try {
                    this.loading = true

                    await axios.post('/api/sessions/' + this.session + '/files/' + file.name, file, {
                        headers: {
                            'Content-Type': file.type,
                            'Session-Name': this.username,
                        },
                    })
                } catch (e) {
                    this.handleError(e)
                }

                this.loading = false
            },
            async deleteFile(file) {
                if (!confirm('Are you sure you want to delete ' + file + ' ?')) {
                    return
                }

                this.loading = true

                try {
                    await axios.delete('/api/sessions/' + this.session + '/files/' + file, {
                        headers: {
                            'Content-Type': file.type,
                            'Session-Name': this.username,
                        },
                    })
                } catch (e) {
                    this.handleError(e)
                }

                this.loading = false
            },
            handleError(error) {
                this.lastError = error.response?.data?.error ?? error.toString()
                console.log(error)
            },
            closeError() {
                this.lastError = ''
            },
            formatLogEvent(event) {
                switch (event.type) {
                    case 'user_join':
                        return event.user + ' joined the session'
                    case 'user_leave':
                        return event.user + ' left the session'
                    case 'file_upload':
                        return event.user + ' uploaded a file: ' + event.file.name
                    case 'file_delete':
                        return event.user + ' deleted a file: ' + event.file.name
                }
            },
            onDragover(event) {
                this.dragActive = true
            },
            onDragleave(event) {
                this.dragActive = false
            },
            onDrop(event) {
                this.uploadFile(event.dataTransfer.files)

                this.dragActive = false
            },
            currentUrl() {
                return window.location.href
            }
        },
    }).mount('#app')
</script>

</body>
</html>
`
