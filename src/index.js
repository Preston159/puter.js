import OS from './modules/OS.js';
import FileSystem from './modules/FileSystem/index.js';
import Hosting from './modules/Hosting.js';
import Apps from './modules/Apps.js';
import UI from './modules/UI.js';
import KV from './modules/KV.js';
import AI from './modules/AI.js';
import Auth from './modules/Auth.js';
import FSItem from './modules/FSItem.js';
import * as utils from './lib/utils.js';
import path from './lib/path.js';

window.puter = (function() {
    'use strict';

    class Puter{
        // The environment that the SDK is running in. Can be 'gui', 'app' or 'web'.
        // 'gui' means the SDK is running in the Puter GUI, i.e. Puter.com.
        // 'app' means the SDK is running as a Puter app, i.e. within an iframe in the Puter GUI.
        // 'web' means the SDK is running in a 3rd-party website.
        env;

        defaultAPIOrigin = 'http://localhost:5259';
        defaultGUIOrigin = 'http://localhost:5259';

        // An optional callback when the user is authenticated. This can be set by the app using the SDK.
        onAuth;

        /**
         * State object to keep track of the authentication request status.
         * This is used to prevent multiple authentication popups from showing up by different parts of the app.
         */
        puterAuthState = {
            isPromptOpen: false,
            authGranted: null,
            resolver: null
        };

        // Holds the unique app instance ID that is provided by the host environment
        appInstanceID;

        // Expose the FSItem class
        static FSItem = FSItem;

        // Event handling properties
        eventHandlers = {};

        // --------------------------------------------
        // Constructor
        // --------------------------------------------
        constructor(options) {
            options = options ?? {};

            // Holds the query parameters found in the current URL
            let URLParams = new URLSearchParams(window.location.search);

            // Figure out the environment in which the SDK is running
            if (URLParams.has('puter.app_instance_id'))
                this.env = 'app';
            else if(window.puter_gui_enabled === true)
                this.env = 'gui';
            else
                this.env = 'web';

            // there are some specific situations where puter is definitely loaded in GUI mode
            // we're going to check for those situations here so that we don't break anything unintentionally
            // if navigator URL's hostname is 'puter.com'
            if(window.location.hostname === 'puter.com'){
                this.env = 'gui';
            }

            // Get the 'args' from the URL. This is used to pass arguments to the app.
            if(URLParams.has('puter.args')){
                this.args = JSON.parse(decodeURIComponent(URLParams.get('puter.args')));
            }else{
                this.args = {};
            }

            // Try to extract appInstanceID from the URL. appInstanceID is included in every messaage
            // sent to the host environment. This is used to help host environment identify the app
            // instance that sent the message and communicate back to it.
            if(URLParams.has('puter.app_instance_id')){
                this.appInstanceID = decodeURIComponent(URLParams.get('puter.app_instance_id'));
            }

            // Try to extract `puter.app.id` from the URL. `puter.app.id` is the unique ID of the app.
            // App ID is useful for identifying the app when communicating with the Puter API, among other things.
            if(URLParams.has('puter.app.id')){
                this.appID = decodeURIComponent(URLParams.get('puter.app.id'));
            }

            // Construct this App's AppData path based on the appID. AppData path is used to store files that are specific to this app.
            // The default AppData path is `~/AppData/<appID>`.
            if(this.appID){
                this.appDataPath = `~/AppData/${this.appID}`;
            }

            // Construct APIOrigin from the URL. APIOrigin is used to build the URLs for the Puter API endpoints.
            // The default APIOrigin is https://api.puter.com. However, if the URL contains a `puter.domain` query
            // parameter, then the APIOrigin will be set to https://api.<puter.domain>.
            this.APIOrigin = this.defaultAPIOrigin;
            if(URLParams.has('puter.domain')){
                this.APIOrigin = 'https://api.' + URLParams.get('puter.domain');
            }

            // The SDK is running in the Puter GUI (i.e. 'gui')
            if(this.env === 'gui'){
                this.authToken = window.auth_token;
                // initialize submodules
                this.initSubmodules();
            }
            // Loaded in an iframe in the Puter GUI (i.e. 'app')
            // When SDK is loaded in App mode the initiation process should start when the DOM is ready
            else if (this.env === 'app') {
                this.authToken = decodeURIComponent(URLParams.get('puter.auth.token'));
                // initialize submodules
                this.initSubmodules();
                // If the authToken is already set in localStorage, then we don't need to show the dialog
                try {
                    if(localStorage.getItem('puter.auth.token')){
                        this.setAuthToken(localStorage.getItem('puter.auth.token'));
                    }
                    // if appID is already set in localStorage, then we don't need to show the dialog
                    if(localStorage.getItem('puter.app.id')){
                        this.setAppID(localStorage.getItem('puter.app.id'));
                    }
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
            // SDK was loaded in a 3rd-party website.
            // When SDK is loaded in GUI the initiation process should start when the DOM is ready. This is because
            // the SDK needs to show a dialog to the user to ask for permission to access their Puter account.
            else if(this.env === 'web') {
                // initialize submodules
                this.initSubmodules();
                try{
                    // If the authToken is already set in localStorage, then we don't need to show the dialog
                    if(localStorage.getItem('puter.auth.token')){
                        this.setAuthToken(localStorage.getItem('puter.auth.token'));
                    }
                    // if appID is already set in localStorage, then we don't need to show the dialog
                    if(localStorage.getItem('puter.app.id')){
                        this.setAppID(localStorage.getItem('puter.app.id'));
                    }
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
        }

        // Initialize submodules
        initSubmodules = function(){
            // Auth
            this.auth = new Auth(this.authToken, this.APIOrigin, this.appID, this.env);
            // OS
            this.os = new OS(this.authToken, this.APIOrigin, this.appID, this.env);
            // FileSystem
            this.fs = new FileSystem(this.authToken, this.APIOrigin, this.appID, this.env);
            // UI
            this.ui = new UI(this.appInstanceID, this.appID, this.env);
            // Hosting
            this.hosting = new Hosting(this.authToken, this.APIOrigin, this.appID, this.env);
            // Apps
            this.apps = new Apps(this.authToken, this.APIOrigin, this.appID, this.env);
            // AI
            this.ai = new AI(this.authToken, this.APIOrigin, this.appID, this.env);
            // Key-Value Store
            this.kv = new KV(this.authToken, this.APIOrigin, this.appID, this.env);
            // Path
            this.path = path;
        }

        updateSubmodules() {
            // Update submodules with new auth token and API origin
            [this.os, this.fs, this.hosting, this.apps, this.ai, this.kv].forEach(module => {
                if(!module) return;
                module.setAuthToken(this.authToken);
                module.setAPIOrigin(this.APIOrigin);
            });
        }

        setAppID = function (appID) {
            // save to localStorage
            try{
                localStorage.setItem('puter.app.id', appID);
            } catch (error) {
                // Handle the error here
                console.error('Error accessing localStorage:', error);
            }
            this.appID = appID;
        }

        setAuthToken = function (authToken) {
            this.authToken = authToken;
            // If the SDK is running on a 3rd-party site or an app, then save the authToken in localStorage
            if(this.env === 'web' || this.env === 'app'){
                try{
                    localStorage.setItem('puter.auth.token', authToken);
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
            // reinitialize submodules
            this.updateSubmodules();
        }

        setAPIOrigin = function (APIOrigin) {
            this.APIOrigin = APIOrigin;
            // reinitialize submodules
            this.updateSubmodules();
        }

        resetAuthToken = function () {
            this.authToken = null;
            // If the SDK is running on a 3rd-party site or an app, then save the authToken in localStorage
            if(this.env === 'web' || this.env === 'app'){
                try{
                    localStorage.removeItem('puter.auth.token');
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
            // reinitialize submodules
            this.updateSubmodules();
        }

        exit = function() {
            window.parent.postMessage({
                msg: "exit",
                appInstanceID: this.appInstanceID,
            }, '*');
        }

        /**
         * A function that generates a domain-safe name by combining a random adjective, a random noun, and a random number (between 0 and 9999).
         * The result is returned as a string with components separated by hyphens.
         * It is useful when you need to create unique identifiers that are also human-friendly.
         *
         * @param {string} [separateWith='-'] - The character to use to separate the components of the generated name.
         * @returns {string} A unique, hyphen-separated string comprising of an adjective, a noun, and a number.
         *
         */
        randName = function(separateWith = '-'){
            const first_adj = ['helpful','sensible', 'loyal', 'honest', 'clever', 'capable','calm', 'smart', 'genius', 'bright', 'charming', 'creative', 'diligent', 'elegant', 'fancy', 
            'colorful', 'avid', 'active', 'gentle', 'happy', 'intelligent', 'jolly', 'kind', 'lively', 'merry', 'nice', 'optimistic', 'polite', 
            'quiet', 'relaxed', 'silly', 'victorious', 'witty', 'young', 'zealous', 'strong', 'brave', 'agile', 'bold'];

            const nouns = ['street', 'roof', 'floor', 'tv', 'idea', 'morning', 'game', 'wheel', 'shoe', 'bag', 'clock', 'pencil', 'pen', 
            'magnet', 'chair', 'table', 'house', 'dog', 'room', 'book', 'car', 'cat', 'tree', 
            'flower', 'bird', 'fish', 'sun', 'moon', 'star', 'cloud', 'rain', 'snow', 'wind', 'mountain', 
            'river', 'lake', 'sea', 'ocean', 'island', 'bridge', 'road', 'train', 'plane', 'ship', 'bicycle', 
            'horse', 'elephant', 'lion', 'tiger', 'bear', 'zebra', 'giraffe', 'monkey', 'snake', 'rabbit', 'duck', 
            'goose', 'penguin', 'frog', 'crab', 'shrimp', 'whale', 'octopus', 'spider', 'ant', 'bee', 'butterfly', 'dragonfly', 
            'ladybug', 'snail', 'camel', 'kangaroo', 'koala', 'panda', 'piglet', 'sheep', 'wolf', 'fox', 'deer', 'mouse', 'seal',
            'chicken', 'cow', 'dinosaur', 'puppy', 'kitten', 'circle', 'square', 'garden', 'otter', 'bunny', 'meerkat', 'harp']

            // return a random combination of first_adj + noun + number (between 0 and 9999)
            // e.g. clever-idea-123
            return first_adj[Math.floor(Math.random() * first_adj.length)] + separateWith + nouns[Math.floor(Math.random() * nouns.length)] + separateWith + Math.floor(Math.random() * 10000);
        }

        getUser = function(...args){
            let options;
    
            // If first argument is an object, it's the options
            if (typeof args[0] === 'object' && args[0] !== null) {
                options = args[0];
            } else {
                // Otherwise, we assume separate arguments are provided
                options = {
                    success: args[0],
                    error: args[1],
                };
            }
    
            return new Promise((resolve, reject) => {
                const xhr = utils.initXhr('/whoami', this.APIOrigin, this.authToken, 'get');
    
                // set up event handlers for load and error events
                utils.setupXhrEventHandlers(xhr, options.success, options.error, resolve, reject);
    
                xhr.send();
            })
        }

        print = function(...args){
            for(let arg of args){
                document.getElementsByTagName('body')[0].append(arg);
            }
        }
    }


    // Create a new Puter object and return it
    const puterobj = new Puter();

    // Return the Puter object
    return puterobj;
}());

window.addEventListener('message', async (event) => {
    // if the message is not from Puter, then ignore it
    if(event.origin !== puter.defaultGUIOrigin) return;

    if(event.data.msg && event.data.msg === 'requestOrigin'){
        event.source.postMessage({
            msg: "originResponse",
        }, '*');    
    }
    else if (event.data.msg === 'puter.token') {
        // puterDialog.close();
        // Set the authToken property
        puter.setAuthToken(event.data.token);
        // update appID
        puter.setAppID(event.data.app_uid);
        // Remove the event listener to avoid memory leaks
        // window.removeEventListener('message', messageListener);

        puter.puterAuthState.authGranted = true;
        // Resolve the promise
        // resolve();

        // Call onAuth callback
        if(puter.onAuth && typeof puter.onAuth === 'function'){
            puter.getUser().then((user) => {
                puter.onAuth(user)
            });
        }

        puter.puterAuthState.isPromptOpen = false;
        // Resolve or reject any waiting promises.
        if (puter.puterAuthState.resolver) {
            if (puter.puterAuthState.authGranted) {
                puter.puterAuthState.resolver.resolve();
            } else {
                puter.puterAuthState.resolver.reject();
            }
            puter.puterAuthState.resolver = null;
        };
    }
})
