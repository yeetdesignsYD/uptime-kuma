import {io} from "socket.io-client";
import { useToast } from 'vue-toastification'
import dayjs from "dayjs";
const toast = useToast()

let socket;

export default {

    data() {
        return {
            socket: {
                token: null,
                firstConnect: true,
                connected: false,
                connectCount: 0,
            },
            remember: (localStorage.remember !== "0"),
            userTimezone: localStorage.timezone || "auto",
            allowLoginDialog: false,        // Allowed to show login dialog, but "loggedIn" have to be true too. This exists because prevent the login dialog show 0.1s in first before the socket server auth-ed.
            loggedIn: false,
            monitorList: { },
            heartbeatList: { },
            importantHeartbeatList: { },
            avgPingList: { },
            uptimeList: { },
            notificationList: [],
        }
    },

    created() {
        socket = io(":3001", {
            transports: ['websocket']
        });

        socket.on('monitorList', (data) => {
            this.monitorList = data;
        });

        socket.on('notificationList', (data) => {
            this.notificationList = data;
        });

        socket.on('heartbeat', (data) => {
            if (! (data.monitorID in this.heartbeatList)) {
                this.heartbeatList[data.monitorID] = [];
            }

            this.heartbeatList[data.monitorID].push(data)

            // Add to important list if it is important
            // Also toast
            if (data.important) {

                if (data.status === 0) {
                    toast.error(`[${this.monitorList[data.monitorID].name}] [DOWN] ${data.msg}`, {
                        timeout: false,
                    });
                } else if (data.status === 1) {
                    toast.success(`[${this.monitorList[data.monitorID].name}] [Up] ${data.msg}`, {
                        timeout: 20000,
                    });
                } else {
                    toast(`[${this.monitorList[data.monitorID].name}] ${data.msg}`);
                }


                if (! (data.monitorID in this.importantHeartbeatList)) {
                    this.importantHeartbeatList[data.monitorID] = [];
                }

                this.importantHeartbeatList[data.monitorID].unshift(data)
            }
        });

        socket.on('heartbeatList', (monitorID, data) => {
            if (! (monitorID in this.heartbeatList)) {
                this.heartbeatList[monitorID] = data;
            } else {
                this.heartbeatList[monitorID] = data.concat(this.heartbeatList[monitorID])
            }
        });

        socket.on('avgPing', (monitorID, data) => {
            this.avgPingList[monitorID] = data
        });

        socket.on('uptime', (monitorID, type, data) => {
            this.uptimeList[`${monitorID}_${type}`] = data
        });

        socket.on('importantHeartbeatList', (monitorID, data) => {
            if (! (monitorID in this.importantHeartbeatList)) {
                this.importantHeartbeatList[monitorID] = data;
            } else {
                this.importantHeartbeatList[monitorID] = data.concat(this.importantHeartbeatList[monitorID])
            }
        });

        socket.on('disconnect', () => {
            console.log("disconnect")
            this.socket.connected = false;
        });

        socket.on('connect', () => {
            console.log("connect")
            this.socket.connectCount++;
            this.socket.connected = true;

            // Reset Heartbeat list if it is re-connect
            if (this.socket.connectCount >= 2) {
                this.clearData()
            }

            if (this.storage().token) {
                this.loginByToken(this.storage().token)
            } else {
                this.allowLoginDialog = true;
            }

            this.socket.firstConnect = false;
        });

    },

    methods: {

        storage() {
            return (this.remember) ? localStorage : sessionStorage;
        },

        getSocket() {
          return socket;
        },

        toastRes(res) {
            if (res.ok) {
                toast.success(res.msg);
            } else {
                toast.error(res.msg);
            }
        },

        login(username, password, callback) {
            socket.emit("login", {
                username,
                password,
            }, (res) => {

                if (res.ok) {
                    this.storage().token = res.token;
                    this.socket.token = res.token;
                    this.loggedIn = true;

                    // Trigger Chrome Save Password
                    history.pushState({}, '')
                }

                callback(res)
            })
        },

        loginByToken(token) {
            socket.emit("loginByToken", token, (res) => {
                this.allowLoginDialog = true;

                if (! res.ok) {
                    this.logout()
                } else {
                    this.loggedIn = true;
                }
            })
        },

        logout() {
            this.storage().removeItem("token");
            this.socket.token = null;
            this.loggedIn = false;

            this.clearData()
        },

        add(monitor, callback) {
            socket.emit("add", monitor, callback)
        },

        deleteMonitor(monitorID, callback) {
            socket.emit("deleteMonitor", monitorID, callback)
        },

        clearData() {
            console.log("reset heartbeat list")
            this.heartbeatList = {}
            this.importantHeartbeatList = {}
        },

    },

    computed: {

        timezone() {

            if (this.userTimezone === "auto") {
                return dayjs.tz.guess()
            } else {
                return this.userTimezone
            }

        },

        lastHeartbeatList() {
            let result = {}

            for (let monitorID in this.heartbeatList) {
                let index = this.heartbeatList[monitorID].length - 1;
                result[monitorID] = this.heartbeatList[monitorID][index];
            }

            return result;
        },

        statusList() {
            let result = {}

            let unknown = {
                text: "Unknown",
                color: "secondary"
            }

            for (let monitorID in this.lastHeartbeatList) {
                let lastHeartBeat = this.lastHeartbeatList[monitorID]

                if (! lastHeartBeat) {
                    result[monitorID] = unknown;
                } else if (lastHeartBeat.status === 1) {
                    result[monitorID] = {
                        text: "Up",
                        color: "primary"
                    };
                } else if (lastHeartBeat.status === 0) {
                    result[monitorID] = {
                        text: "Down",
                        color: "danger"
                    };
                } else {
                    result[monitorID] = unknown;
                }
            }

            return result;
        }
    },

    watch: {

        remember() {
            localStorage.remember = (this.remember) ? "1" : "0"
        }

    }

}
