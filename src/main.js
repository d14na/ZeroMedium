version = "18.01.2"
allLanguages = ["EN", "ES", "ZH", "UK", "RU"]; // TODO: use in signin-modal?

// Zeroframe
var ZeroFrame = require("./ZeroFrame.js");

// Router
var Router = require("./router.js");

// Cache
var { cache_add, cache_replace, cache_remove, cache_get, cache_getOrAdd, cache_exists, cache_clear } = require("./cache.js");

// Vue
var Vue = require("vue/dist/vue.min.js");
var VueZeroFrameRouter = require("./vue-zeroframe-router.js");

// Vue Components
require("./vue_components/navbar.js");
require("./vue_components/signin-modal.js");
require("./vue_components/language-modal.js");
require("./vue_components/story.js");
require("./vue_components/response.js");

var sanitizeHtml = require("sanitize-html");
var { sanitizeStringForUrl, sanitizeStringForUrl_SQL, html_substr } = require("./util.js");

Vue.use(VueZeroFrameRouter.VueZeroFrameRouter);

var app = new Vue({
    el: "#app",
    template: `
        <div>
            <custom-nav v-on:show-signin-modal="showSigninModal()" v-on:get-user-info="getUserInfo()" v-bind:user-info="userInfo" v-bind:shadow="navbarShadow"></custom-nav>
            <component ref="view" v-bind:is="currentView" v-on:show-signin-modal="showSigninModal()" v-on:navbar-shadow-on="navbarShadowOn()" v-on:navbar-shadow-off="navbarShadowOff()" v-on:get-user-info="getUserInfo()" v-bind:user-info="userInfo" v-bind:response-content="responseContent" v-on:set-response-content="setResponseContent"></component>
            <signin-modal v-model="signin_modal_active" v-on:get-user-info="getUserInfo()" v-if="signin_modal_active" v-bind:user-info="userInfo"></signin-modal>
            <language-modal v-model="language_modal_active" v-on:get-user-info="getUserInfo()" v-if="language_modal_active" v-bind:user-info="userInfo"></language-modal>

            <footer class="footer">
                <div class="container">
                    <div class="has-text-centered">
                        <em>&copy; Copyright 2017 Christian Seibold. BSD License.</em><br>
                        Current Version: <a :href="'./?/12gAes6NzDS9E2q6Q1UXrpUdbPS6nvuBPu/' + getVersionLink()">{{ version }}</a><br>
                        <a href="/1BEPbMfV8QtaZCD2cPNbabfDKnmhTAZRPx">Git Center Repo</a>
                    </div>
                </div>
            </footer>
        </div>
        `,
    data: {
        currentView: null,
        siteInfo: null,
        userInfo: null,
        navbarShadow: false,
        signin_modal_active: false,
        language_modal_active: false,
        responseContent: "" // Used to transfer content from small response box to fullscreen route
    },
    methods: {
        getVersionLink: function() {
            var version_split = version.split(".");
            var version_main = version_split[0] + "-" + version_split[1];
            return "version-" + version_main.replace(/ /g, "");
        },
        goto: function(to) {
            Router.navigate(to);
        },
        navbarShadowOn: function() {
            this.navbarShadow = true;
        },
        navbarShadowOff: function() {
            this.navbarShadow = false;
        },
        showSigninModal: function() {
            if (this.siteInfo == null) {
                return;
            }
            this.signin_modal_active = true;
        },
        closeSigninModal: function() {
            this.signin_modal_active = false;
        },
		getUserInfo: function() { // TODO: This can be passed in a function as a callback
            if (this.siteInfo == null || this.siteInfo.cert_user_id == null) {
                this.userInfo = null;
                return;
            }

            var that = this;

            page.cmd("dbQuery", ["SELECT key, value FROM keyvalue LEFT JOIN json USING (json_id) WHERE cert_user_id=\"" + this.siteInfo.cert_user_id + "\" AND directory=\"users/" + this.siteInfo.auth_address + "\""], (rows) => {
                var keyvalue = {};

                for (var i = 0; i < rows.length; i++) {
                    var row = rows[i];
                    
                    keyvalue[row.key] = row.value;
                }
                if (!keyvalue.name || keyvalue.name === "") {
                    return;
                }
                that.userInfo = {
                    cert_user_id: that.siteInfo.cert_user_id,
                    auth_address: that.siteInfo.auth_address,
                    keyvalue: keyvalue
                };

                if (!keyvalue.languages || keyvalue.languages === "") {
                    that.language_modal_active = true;
                    that.$on("setUserLanguages", (languages) => {
                        that.keyvalue.languages = languages;
                        that.$emit("setUserInfo", that.userInfo);
                        cache_remove("home_topics");
                        if (Router.currentRoute == "") {
                            that.$refs.view.getTopics();
                        }
                        /*page.getTopics((topics) => {
                            console.log(topics);
                            cache_add("home_topics", topics);
                        });*/
                    });
                } else {
                    that.$emit("setUserInfo", that.userInfo);
                    cache_remove("home_topics");
                    if (Router.currentRoute == "") {
                        that.$refs.view.getTopics();
                    }
                    /*page.getTopics((topics) => {
                        console.log(topics);
                        cache_add("home_topics", topics);
                    });*/
                }
            });
        },
        setResponseContent: function(content) {
            this.responseContent = content;
        }
    }
});

class ZeroApp extends ZeroFrame {
    onOpenWebsocket() {
        this.cmd("siteInfo", {}, (site_info) => {
            this.site_info = site_info;
            app.siteInfo = this.site_info;
            app.getUserInfo();

            /* ZeroGraph.addMerger(() => {
                ZeroGraph.requestPermission(site_info);
            });*/
        });
    }

    onRequest(cmd, message) {
        if (cmd === "setSiteInfo") {
            this.site_info = message.params;
            app.siteInfo = this.site_info;
            app.getUserInfo();
        }
        Router.listenForBack(cmd, message);
        if (message.params.event[0] === "file_done") {
            if (Router.currentRoute === "" || Router.currentRoute === "search" || Router.currentRouter === "topic/:slug") {
                app.$refs.view.getStories();
            }
        }
    }
    
    selectUser(f = null) {
        this.cmd("certSelect", { accepted_domains: ["zeroid.bit", "kaffie.bit", "cryptoid.bit"] }, () => {
            cache_remove("user_profileInfo");
            cache_remove("user_claps");
            cache_remove("home_recentStories");
            cache_remove("home_topStories");
            if (f != null && typeof f === "function") f();
        });
        return false;
    }

    signout(f = null) {
        this.cmd("certSelect", { accepted_domains: [""] }, () => {
            cache_remove("user_profileInfo");
            cache_remove("user_claps");
            if (f != null && typeof f === "function") f();
        });
    }
    
    languageNameFromCode(code) {
        switch (code) {
            case "EN":
            {
                return "English";
            } break;

            case "ES":
            {
                return "Español";
            } break;

            case "ZH":
            {
                return "Chinese";
            } break;

            case "UK":
            {
                return "Українська";
            } break;

            case "RU":
            {
                return "Русский";
            } break;

            default:
            {
                return "Unknown: " + code;
            } break;
        }
    }

    showImage(elem, imgLocation, width, height) {
        var inner_path = imgLocation.replace(/(http:\/\/)?127.0.0.1:43110\//, '').replace(/(https:\/\/)?127.0.0.1:43110\//, '').replace(/18GAQeWN4B7Uum6rvJL2zh9oe4VfcnTM18\//, '').replace(/1CVmbCKWtbskK2GAZLM6gnMuiL6Je25Yds\//, '').replace(/ZeroMedium.bit\//, '');

        if (height === 0 && width === 0) {
            elem.parentElement.innerHTML = "<img src='" + imgLocation + "'>";
        } else if (height === 0) {
            elem.parentElement.innerHTML = "<img src='" + imgLocation + "' width='" + width + "'>";    
        } else if (width === 0) {
            elem.parentElement.innerHTML = "<img src='" + imgLocation + "' height='" + height + "'>";
        } else {
            elem.parentElement.innerHTML = "<img src='" + imgLocation + "' width='" + width + "' height='" + height + "'>";
        }
    }

    showAudio(elem, location, width, height) {
        var inner_path = location.replace(/(http:\/\/)?127.0.0.1:43110\//, '').replace(/(https:\/\/)?127.0.0.1:43110\//, '').replace(/18GAQeWN4B7Uum6rvJL2zh9oe4VfcnTM18\//, '').replace(/1CVmbCKWtbskK2GAZLM6gnMuiL6Je25Yds\//, '').replace(/ZeroMedium.bit\//, '');

        if (height === 0 && width === 0) {
            elem.parentElement.innerHTML = "<audio src='" + location + "' controls></audio>";
        } else if (height === 0) {
            elem.parentElement.innerHTML = "<audio src='" + location + "' width='" + width + "' controls></audio>";    
        } else if (width === 0) {
            elem.parentElement.innerHTML = "<audio src='" + location + "' height='" + height + "' controls></audio>";
        } else {
            elem.parentElement.innerHTML = "<audio src='" + location + "' width='" + width + "' height='" + height + "' controls></audio>";
        }
    }

    showVideo(elem, location, width, height) {
        var inner_path = location.replace(/(http:\/\/)?127.0.0.1:43110\//, '').replace(/(https:\/\/)?127.0.0.1:43110\//, '').replace(/18GAQeWN4B7Uum6rvJL2zh9oe4VfcnTM18\//, '').replace(/1CVmbCKWtbskK2GAZLM6gnMuiL6Je25Yds\//, '').replace(/ZeroMedium.bit\//, '');

        if (height === 0 && width === 0) {
            elem.parentElement.innerHTML = "<video src='" + location + "' controls></video>";
        } else if (height === 0) {
            elem.parentElement.innerHTML = "<video src='" + location + "' width='" + width + "' controls></video>";    
        } else if (width === 0) {
            elem.parentElement.innerHTML = "<video src='" + location + "' height='" + height + "' controls></video>";
        } else {
            elem.parentElement.innerHTML = "<video src='" + location + "' width='" + width + "' height='" + height + "' controls></video>";
        }
    }

    getTopics(f = null) {
        if (app.userInfo && app.userInfo.keyvalue && app.userInfo.keyvalue.languages !== "") {
            var primarylang = app.userInfo.keyvalue.languages.split(",")[0].toLowerCase();

            var addToQuery = "";
            if (primarylang !== "en" && primarylang !== "EN") {
                addToQuery = "_" + primarylang;
            }
            page.cmd("dbQuery", ["SELECT * FROM topics" + addToQuery], (topics) => {
                if (f != null && typeof f === "function") {
                    f(topics);
                }
            });
        } else {
            page.cmd("dbQuery", ["SELECT * FROM topics"], (topics) => {
                if (f != null && typeof f === "function") {
                    f(topics);
                }
            });
        }
    }

    getTopicsInLang(lang = "en", f = null) {
        var addToQuery = "";
        if (lang !== "en" && lang !== "EN") {
            addToQuery = "_" + lang.toLowerCase();
        }
        page.cmd("dbQuery", ["SELECT * FROM topics" + addToQuery], (topics) => {
            if (f != null && typeof f === "function") {
                f(topics);
            }
        });
    }

    getTopicInLang(topic_id, lang = "en", f = null) {
        var addToQuery = "";
        if (lang !== "en" && lang !== "EN") {
            addToQuery = "_" + lang.toLowerCase();
        }
        console.log(addToQuery);
        page.cmd("dbQuery", ["SELECT * FROM topics" + addToQuery + " WHERE topic_id=" + topic_id + " LIMIT 1"], (topics) => {
            console.log(topics);
            if (f != null && typeof f === "function") {
                f(topics);
            }
        });
    }

    getUserProfileInfo(auth_address, getStoryList, getResponsesList, f = null) {
        var userProfileInfo = {};

        userProfileInfo["auth_address"] = auth_address;
        // Get Keyvalue data
        page.cmd("dbQuery", ['SELECT key, value, cert_user_id FROM keyvalue LEFT JOIN json USING (json_id) WHERE directory="users/' + auth_address + '"'], (rows) => {
            if (rows && rows.length > 0 && rows[0]) {
                userProfileInfo["cert_user_id"] = rows[0].cert_user_id;
            }
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];

                if (row.key === "name") userProfileInfo["name"] = row.value;
                if (row.key === "about") userProfileInfo["about"] = row.value;
            }

            // Get stories
            if (getStoryList) {
                userProfileInfo["stories"] = [];
                page.cmd("dbQuery", ['SELECT story_id, title, slug, description, tags, language, date_updated, date_added, cert_user_id, directory FROM stories LEFT JOIN json USING (json_id) WHERE directory="users/' + auth_address + '" ORDER BY date_added DESC'], (stories) => {
                    userProfileInfo["stories"] = stories;

                    if (getResponsesList) {
                        userProfileInfo["responses"] = [];
                        page.cmd('dbQuery', ['SELECT * FROM responses LEFT JOIN json USING (json_id) WHERE directory="users/' + auth_address + '" ORDER BY date_added DESC'], (responses) => {
                            userProfileInfo["responses"] = responses;

                            if (f != null && typeof f === "function") {
                                f(userProfileInfo);
                            }
                        });
                    } else {
                        if (f != null && typeof f === "function") {
                            f(userProfileInfo);
                        }
                    }
                });
            } else if (getResponsesList) {
                userProfileInfo["responses"] = [];

                page.cmd('dbQuery', ['SELECT * FROM responses LEFT JOIN json USING (json_id) WHERE directory="users/' + auth_address + '" ORDER BY date_added DESC'], (responses) => {
                    userProfileInfo["responses"] = responses;

                    if (f != null && typeof f === "function") {
                        f(userProfileInfo);
                    }
                });
            } else {
                if (f != null && typeof f === "function") {
                    f(userProfileInfo);
                }
            }
        });
    }

	setInterests(interests, f = null) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + app.userInfo.auth_address + "/data.json";
        var content_inner_path = "data/users/" + app.userInfo.auth_address + "/content.json";

        page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
			if (!data) return;
			data = JSON.parse(data);

			data["interests"] = interests;

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

            page.cmd("fileWrite", [data_inner_path, btoa(json_raw)], (res) => {
                if (res === "ok") {
                    page.cmd("siteSign", { "inner_path": content_inner_path }, () => {
                        if (f != null && typeof f === "function") {
                            f();
                        }
                        page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                    });
                }
			});
		});
	}

    sanitizeHtml(text) {
        return sanitizeHtml(text, {
            allowedTags: ["b", "i", "em", "strong", "u", "a", "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "div", "blockquote", "code", "strike", "ul", "li", "ol", "nl", "hr", "table", "thead", "caption", "tbody", "tr", "th", "td", "pre", "span", "img", "audio", "video"],
            allowedAttributes: {
                "a": [ "href", "name", "target", "align" ],
                "img": [ "src", "align", "width", "height"],
                "audio": [ "src", "align", "width", "height", "controls"],
                "video": [ "src", "align", "width", "height", "controls"],
                "div": [ "align" ],
                "p": [ "align" ],
                "h1": [ "align" ],
                "h2": [ "align" ],
                "h3": [ "align" ],
                "h4": [ "align" ],
                "h5": [ "align" ],
                "h6": [ "align" ],
                "strong": [ "align" ],
                "u": [ "align" ],
                "b": [ "align" ],
                "i": [ "align" ],
                "em": [ "align" ],
                "pre": [ "align" ],
                "code": [ "align" ],
                "table": [ "align" ]
            },
            allowedSchemesByTag: {
              img: [ "data" ],
              audio: [ "data" ],
              video: [ "data" ]
            }
        });
    }

    postStory(title, description, body, tags, language, f = null) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + app.userInfo.auth_address + "/data.json";
        var content_inner_path = "data/users/" + app.userInfo.auth_address + "/content.json";

        page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
            if (!data) {
                // TODO: Show registration modal.
                return;
            } else {
                data = JSON.parse(data);
            }

            if (!data["stories"]) data["stories"] = [];

            // Is slug already exists, append date to it
            var storyDate = Date.now();
            var storySlug = sanitizeStringForUrl(title);

            for (var story of data["stories"]) {
                if (story.slug == storySlug) {
                    storySlug += "-" + storyDate;
                    break;
                }
            }

            if (language == null) {
                language = app.userInfo.keyvalue.languages.split(",")[0];
            }

            data["stories"].push({
                "story_id": app.userInfo.keyvalue["next_story_id"] || 1,
                "title": title,
                "slug": storySlug,
                "description": description,
                "body": page.sanitizeHtml(body),
                "tags": tags,
                "language": language,
                "date_added": storyDate
            });

            if (!app.userInfo.keyvalue["next_story_id"] || app.userInfo.keyvalue["next_story_id"] == null) app.userInfo.keyvalue["next_story_id"] = 1;
            //console.log(app.userInfo.keyvalue);
            app.userInfo.keyvalue["next_story_id"]++;
            data["next_story_id"] = app.userInfo.keyvalue["next_story_id"];

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

            page.cmd('fileWrite', [data_inner_path, btoa(json_raw)], (res) => {
                if (res === "ok") {
                    page.cmd("siteSign", { "inner_path": content_inner_path }, (res) => {
                        if (f != null && typeof f === "function") {
                            f(storySlug);
                        }
                        page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                    });
                }
            });
        });
    }

    editStory(story_id, title, description, body, tags, language, f = null) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + app.userInfo.auth_address + "/data.json";
        var content_inner_path = "data/users/" + app.userInfo.auth_address + "/content.json";

        page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
            if (!data) {
                console.log("ERROR");
                return;
            } else {
                data = JSON.parse(data);
            }

            if (!data["stories"]) {
                console.log("ERROR");
                return;
            }

            // Is slug already exists, append (updated) date to it
            var storyDate = Date.now();
            var storySlug = sanitizeStringForUrl(title);

            for (var story of data["stories"]) {
                if (story.slug == storySlug && story.story_id != story_id) {
                    storySlug += "-" + storyDate;
                    break;
                }
            }

            for (var i = 0; i < data["stories"].length; i++) {
                var story = data["stories"][i];
                if (story.story_id == story_id) {
                    story.title = title;
                    story.slug = storySlug;
                    story.body = page.sanitizeHtml(body);
                    story.tags = tags;
                    if (language && language !== "") {
                        story.language = language;
                    }
                    story.description = description;
                    story.date_updated = storyDate;
                    break;
                }
            }

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

            page.cmd("fileWrite", [data_inner_path, btoa(json_raw)], (res) => {
                if (res === "ok") {
                    page.cmd("siteSign", { "inner_path": content_inner_path }, (res) => {
                        if (f != null && typeof f === "function") {
                            f(storySlug);
                        }
                        page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                    });
                }
            });
        });
    }

    deleteStory(story_id, f = null) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + app.userInfo.auth_address + "/data.json";
        var content_inner_path = "data/users/" + app.userInfo.auth_address + "/content.json";

        page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
            if (!data) {
                console.log("ERROR");
                return;
            } else {
                data = JSON.parse(data);
            }

            if (!data["stories"]) {
                console.log("ERROR");
                return;
            }

            for (var i = 0; i < data["stories"].length; i++) {
                var story = data["stories"][i];
                if (story.story_id == story_id) {
                    data["stories"].splice(i, 1);
                    break;
                }
            }

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

            page.cmd("wrapperConfirm", ["Are you sure?", "Delete"], (confirmed) =>{
                if (confirmed) {
                    page.cmd("fileWrite", [data_inner_path, btoa(json_raw)], (res) => {
                        if (res === "ok") {
                            page.cmd('siteSign', {"inner_path": content_inner_path}, () => {
                                if (f != null && typeof f === "function") {
                                    f();
                                }
                                page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                            });
                        }
                    });
                }
            });
        });
    }

    getStory(auth_address, slug, f = null) {
        // TODO: If two stories have the same title, go with the oldest (ORDER BY ___)
        /*page.cmd("dbQuery", ['SELECT story_id, title, slug, description, body, tags, language, date_updated, date_added, value FROM stories LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE directory="users/' + auth_address + '" AND slug="' + slug + '" AND key="name"'], (stories) => {
            if (!stories || stories.length == 0) {
                f(null);
                return;
            }
            if (f != null && typeof f === "function") {
                f(stories[0]);
            }
        });*/
        return Models.Story.get(auth_address, slug)
            .then((stories) => {
                return stories[0];
            }).then(f);
    }

    // Used to get story that a response is on (for showing the response on an author's profile)
    // This will only get the stories id, title, and slug
    getStoryMinimal(auth_address, story_id, f = null) {
        /*page.cmd("dbQuery", ['SELECT story_id, title, slug, language, directory, value FROM stories LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE key="name" AND story_id=' + story_id + ' AND directory="users/' + auth_address + '"'], (stories) => {
            if (!stories || stories.length == 0) {
                f(null);
                return;
            }
            if (f != null && typeof f === "function") {
                f(stories[0]);
            }
        });*/
        return Models.Story.getMinimal(auth_address, story_id)
            .then((stories) => {
                return stories[0];
            }).then(f);
    }

    // languages - array of languages
    generateLanguageDBQuery(languages) {
        var query = "(";

        for (var i = 0; i < languages.length; i++) {
            query += "language='" + languages[i] + "'";
            if (i < languages.length - 1) {
                query += " OR ";
            }
        }
        query += ")";

        return query;
    }

    getStoriesFromTag(tagSlug, f = null) {
        //page.cmd("dbQuery", ['SELECT * FROM stories LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE key="name" AND REPLACE(tags, " ", "-") LIKE "%' + tagSlug + '%" ORDER BY date_added DESC'], f); // AND includes tag name generated from tag slug
        return Models.Story.getAllFromTag(tagSlug)
            .then(f);
    }

    // Make getExtra true to get claps and responses on the story (TODO: does not include the responses on the responses)
    getAllStories(getExtra, includeTestFunction, f = null) {
        // Since userInfo may not be set yet, this will check for userInfo. If it is not set, call function to set it and do rest once done.
        var command = () => {
            var languageDBQuery = "";

            if (app.userInfo) {
                var userLanguages = app.userInfo.keyvalue.languages.split(",");
                languageDBQuery = "AND " + page.generateLanguageDBQuery(userLanguages);
            }
            page.cmd("dbQuery", ['SELECT * FROM stories LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE key="name" ' + languageDBQuery + ' ORDER BY date_added DESC'], (stories) => {
                var storiesToInclude = [];

                for (var i = 0; i < stories.length; i++) {
                    let story = stories[i];
                    let story_auth_address = story.directory.replace(/users\//, "").replace(/\//g, "");

                    if (getExtra) {
                        if (i == stories.length - 1) {
                            page.getResponses(story_auth_address, story.story_id, "s", (responses) => {
                                story["responses"] = responses;

                                page.getClaps(story_auth_address, story.story_id, "s", (claps) => {
                                    story["claps"] = claps;

                                    if (includeTestFunction(story)) {
                                        storiesToInclude.push(story);
                                    }
                                    
                                    if (f && typeof f === "function") {
                                        f(storiesToInclude);
                                    }
                                });
                            });
                        } else {
                            page.getResponses(story_auth_address, story.story_id, "s", (responses) => {
                                story["responses"] = responses;

                                page.getClaps(story_auth_address, story.story_id, "s", (claps) => {
                                    story["claps"] = claps;

                                    if (includeTestFunction(story)) {
                                        storiesToInclude.push(story);
                                    }
                                });
                            });
                        }
                    } else {
                        if (includeTestFunction(story)) {
                            storiesToInclude.push(story);
                        }
                        if (i == stories.length - 1) {
                            if (f && typeof f === "function") {
                                f(storiesToInclude);
                            }
                        }
                    }
                }
            });
        }

        if (!app.userInfo) {
            command();
            app.$on("setUserInfo", command);
        } else {
            command();
        }
    }

    // Reference types:
    //  s - story
    //  r - response
    postResponse(reference_auth_address, reference_id, reference_type, body, f = null) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + app.userInfo.auth_address + "/data.json";
        var content_inner_path = "data/users/" + app.userInfo.auth_address + "/content.json";

        /*var response = new Models.Response();
        response.response_id = app.userInfo.keyvalue["next_response_id"] || 1;
        response.body = page.sanitizeHtml(body);
        response.reference_id = reference_id;
        response.reference_auth_address = reference_auth_address;
        response.reference_type = reference_type;
        response.date_added = Date.now();
        response.save(page, data_inner_path, (data) => {
            if (!app.userInfo.keyvalue["next_response_id"] || app.userInfo.keyvalue["next_response_id"] == null) app.userInfo.keyvalue["next_response_id"] = 1;
            app.userInfo.keyvalue["next_response_id"]++;
            data["next_response_id"] = app.userInfo.keyvalue["next_response_id"];
        }).then((success) => {
                if (success) {
                    if (f != null && typeof f === "function") f();
                    return response.sign(page, content_inner_path, false);
                }

                return false;
            }).then((success) => {
                if (success) {
                    return response.publish(page, content_inner_path);
                }

                return false;
            });*/

        page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
            if (!data) {
                // TODO: Show registration modal.
                return;
            } else {
                data = JSON.parse(data);
            }

            if (!data["responses"]) data["responses"] = [];

            data["responses"].push({
                "response_id": app.userInfo.keyvalue["next_response_id"] || 1,
                "body": page.sanitizeHtml(body),
                "reference_id": reference_id,
                "reference_auth_address": reference_auth_address,
                "reference_type": reference_type,
                "date_added": Date.now()
            });

            if (!app.userInfo.keyvalue["next_response_id"] || app.userInfo.keyvalue["next_response_id"] == null) app.userInfo.keyvalue["next_response_id"] = 1;
            app.userInfo.keyvalue["next_response_id"]++;
            data["next_response_id"] = app.userInfo.keyvalue["next_response_id"];

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

            page.cmd("fileWrite", [data_inner_path, btoa(json_raw)], (res) => {
                if (res === "ok") {
                    page.cmd("siteSign", { "inner_path": content_inner_path }, () => {
                        if (f != null && typeof f === "function") {
                            f();
                        }
                        page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                    });
                }
            });
        });
    }

    getResponses(reference_auth_address, reference_id, reference_type, f) {
        //page.cmd("dbQuery", ['SELECT * FROM responses LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE reference_auth_address="' + reference_auth_address + '" AND reference_id=' + reference_id + ' AND reference_type="' + reference_type + '" AND key="name" ORDER BY date_added DESC'], f);
        return Models.Response.getAllFromStory(reference_auth_address, reference_id, reference_type)
            .then(f);
    }

    getResponse(auth_address, response_id, f) {
        //page.cmd("dbQuery", ['SELECT * FROM responses LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE key="name" AND directory="users/' + auth_address + '" AND response_id=' + response_id + " LIMIT 1"], (responses) => {
        if (typeof response_id !== "number") {
            response_id = parseInt(response_id);
        }
        Models.Response.get(auth_address, response_id)
            .then((responses) => {
                var response = responses[0];

                return Models.Story.getFromId(response.reference_auth_address, response.reference_id)
                    .then((stories) => {
                        response["story"] = stories[0];
                        return response;
                    });
            }).then(f);
    }

    // Reference Types:
    //  s - story
    //  r - response
    postClap(reference_auth_address, reference_id, reference_type, f = null) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + app.userInfo.auth_address + "/data.json";
        var content_inner_path = "data/users/" + app.userInfo.auth_address + "/content.json";

        page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
            if (!data) {
                // TODO: Show registration modal.
                return;
            } else {
                data = JSON.parse(data);
            }

            if (!data["claps"]) data["claps"] = [];

            var alreadyVoted = false;
            var voteIndex = null;
            for (var i = 0; i < data.claps.length; i++) {
                if (data.claps[i].reference_id == reference_id && data.claps[i].reference_auth_address == reference_auth_address) {
                    alreadyVoted = true;
                    voteIndex = i;
                    break;
                }
            }

            if (alreadyVoted) {
                if (data.claps[voteIndex].number == 0) {
                    data.claps[voteIndex].number = 1;
                    data.claps[voteIndex].date_added = Date.now();
                } else {
                    data.claps[voteIndex].number = 0;
                }
                /*if (data.claps[voteIndex].number < 0 && downvote) {
                    data.claps[voteIndex].number = 0;
                } else if (data.claps[voteIndex].number > 0 && !downvote) {
                    data.claps[voteIndex].number = 0;
                } else if (data.claps[voteIndex].number >= 0 && downvote) {
                    data.claps[voteIndex].number = -1;
                } else if (data.claps[voteIndex].number <= 0 && !downvote) {
                    data.claps[voteIndex].number = 1;
                }*/
            } else {
                data.claps.push({
                    "clap_id": app.userInfo.keyvalue["next_clap_id"] || 1,
                    "reference_auth_address": reference_auth_address,
                    "reference_id": reference_id,
                    "reference_type": reference_type,
                    "number": 1,
                    "date_added": Date.now()
                });

                if (!app.userInfo.keyvalue["next_clap_id"] || app.userInfo.keyvalue["next_clap_id"] == null) app.userInfo.keyvalue["next_clap_id"] = 1;
                app.userInfo.keyvalue["next_clap_id"]++;
                data["next_clap_id"] = app.userInfo.keyvalue["next_clap_id"];
            }

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, '\t')));

            page.cmd("fileWrite", [data_inner_path, btoa(json_raw)], (res) => {
                if (res === "ok") {
                    page.cmd("siteSign", { "inner_path": content_inner_path }, () => {
                        if (f != null && typeof f === 'function') {
                            f();
                        }
                        page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                    });
                }
            });
        });
    }

    getClaps(reference_auth_address, reference_id, reference_type, f) {
        page.cmd("dbQuery", ['SELECT * FROM claps LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE reference_auth_address="' + reference_auth_address + '" AND reference_id=' + reference_id + ' AND reference_type="' + reference_type + '" AND key="name" ORDER BY date_added DESC'], f);
    }

    getUserClaps(auth_address, f) {
        page.cmd("dbQuery", ['SELECT number, reference_auth_address, reference_id, reference_type FROM claps LEFT JOIN json USING (json_id) WHERE directory="users/' + auth_address + '" AND number=1 ORDER BY date_added DESC'], (claps) => {
            var newClaps = [];

            for (var i = 0; i < claps.length; i++) {
                let clap = claps[i]; // Don't use var, otherwise the lambda's will use the same value for this (because var is function scope, not block scope and because javascript is dumb).
                
                if (clap.reference_type == "s") {
                    if (i == claps.length - 1) { // If last clap
                        page.cmd("dbQuery", ['SELECT story_id, description, slug, title, date_updated, date_added, directory, value FROM stories LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE key="name" AND story_id=' + clap.reference_id + ' AND directory="users/' + clap.reference_auth_address + '"'], (story) => {
                            clap["story"] = story[0];
                            newClaps.push(clap);

                            if (typeof f === "function") {
                                f(newClaps);
                            }
                        });
                    } else {
                        page.cmd("dbQuery", ['SELECT story_id, description, slug, title, date_updated, date_added, directory, value FROM stories LEFT JOIN json USING (json_id) LEFT JOIN keyvalue USING (json_id) WHERE key="name" AND story_id=' + clap.reference_id + ' AND directory="users/' + clap.reference_auth_address + '"'], (story) => {
                            clap["story"] = story[0];

                            newClaps.push(clap);
                        });
                    }
                }
            }
        });
    }

    getUsers(f) {
        page.cmd("dbQuery", ['SELECT * FROM keyvalue LEFT JOIN json USING (json_id) WHERE key="name"'], f);
    }

    unimplemented() {
        page.cmd("wrapperNotification", ["info", "Unimplemented!"]);
    }

    checkOptional(doSignPublish, f) {
        if (!app.userInfo || !app.userInfo.cert_user_id) {
            this.cmd("wrapperNotification", ["info", "Please login first."]);
            //page.selectUser(); // TODO: Check if user has data, if not, show the registration modal.
            return;
        }

        var data_inner_path = "data/users/" + page.site_info.auth_address + "/data.json";
        var content_inner_path = "data/users/" + page.site_info.auth_address + "/content.json";

        // Verify that user has correct "optional" and "ignore" values
        page.cmd("fileGet", { "inner_path": content_inner_path, "required": false }, (data) => {
            if (!data) return;
            data = JSON.parse(data);

            var curoptional = ".+\\.(png|jpg|jpeg|gif|mp3|flac|ogg|mp4|webm)";
            var changed = false;
            if (!data.hasOwnProperty("optional") || data.optional !== curoptional){
                data.optional = curoptional
                changed = true;
            }

            var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

            if (changed) {
                // Write (and Sign and Publish is doSignPublish)
                page.cmd("fileWrite", [content_inner_path, btoa(json_raw)], (res) => {
                    if (res === "ok") {
                        if (f != null && typeof f === "function") f();
                        if (doSignPublish) {
                            page.cmd("siteSign", { "inner_path": content_inner_path }, () => {
                                page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                            });
                        }
                    } else {
                        page.cmd("wrapperNotification", ["error", "File write error: " + JSON.stringify(res)]);
                    }
                });
            } else {
                if (f != null && typeof f === "function") f();
            }
        });
    }

    uploadImage(file, file_data, doSignAndPublish = false, f = null) {
        var data_inner_path = "data/users/" + page.site_info.auth_address + "/data.json";
        var content_inner_path = "data/users/" + page.site_info.auth_address + "/content.json";

        // Verify that user has correct "optional" and "ignore" values
        page.checkOptional(false, function() {
            page.cmd("fileGet", { "inner_path": data_inner_path, "required": false }, (data) => {
                if (!data) {
                    //page.cmd("wrapperNotification");
                    return; // ERROR
                }

                data = JSON.parse(data);

                if (!data["files"]) {
                    data["files"] = [];
                }

                var date_added = Date.now();

                // .replace(/[^\x00-\x7F]/g, "") removes non-ascii characters
                // Ascii is defined as being between 0 and 127 (x7F is 127 in hex)
                // [^] matches anything that is NOT within the brackets, therefore
                // [^\x00-\x7F] will match anything that is NOT ascii
                var orig_filename_list = file.name.split(".");
                var filename = orig_filename_list[0].replace(/\s/g, "_").replace(/[^\x00-\x7F]/g, "").replace(/\'/g, "").replace(/\"/g, "") + "-" + date_added + "." + orig_filename_list[orig_filename_list.length - 1];

                console.log(file.type);

                data["files"].push({
                    "file_name": filename,
                    "type": file.type,
                    "date_added": date_added
                });

                var f_path = "data/users/" + page.site_info.auth_address + "/" + filename;

                var json_raw = unescape(encodeURIComponent(JSON.stringify(data, undefined, "\t")));

                // Write image to disk
                page.cmd("fileWrite", [f_path, file_data], (res) => {
                    if (res === "ok") {
                        // Pin file so it is excluded from the automatized optional file cleanup
                        page.cmd("optionalFilePin", { "inner_path": f_path });

                        /* if (imageUpload.value) {
                            imageUpload.parentNode.replaceChild(imageUpload.cloneNode(true), imageUpload)
                        }*/

                        // Add file to data.json
                        page.cmd("fileWrite", [data_inner_path, btoa(json_raw)], (res) => {
                            if (res === "ok") {
                                var output_url = "/" + page.site_info.address + "/" + f_path;

                                // NOTE: When uploading image for a story, the signing and publishing is disabled because
                                // this will happen when the story is signed and published
                                if (doSignAndPublish) {
                                    page.cmd("siteSign", { "inner_path": content_inner_path }, (res) => {
                                        if (res === "ok") {
                                            if (f && typeof f === "function") {
                                                f(output_url);
                                            }
                                            page.cmd("sitePublish", { "inner_path": content_inner_path, "sign": false });
                                        } else {
                                            page.cmd("wrapperNotification", ["error", "Signing failed!"]);
                                        }
                                    });
                                } else {
                                    if (f && typeof f === "function") {
                                        f(output_url);
                                    }
                                }
                            } else {
                                page.cmd("wrapperNotification", ["error", "File write error: " + JSON.stringify(res)]);
                            }
                        });
                    } else {
                        page.cmd("wrapperNotification", ["error", "Image-File write error: " + JSON.stringify(res)]);
                    }
                });
            });
        });
    }

    uploadBigFile(file, f = null) {
        var date_added = Date.now();
        var orig_filename_list = file.name.split(".");
        var filename = orig_filename_list[0].replace(/\s/g, "_").replace(/[^\x00-\x7F]/g, "").replace(/\'/g, "").replace(/\"/g, "") + "-" + date_added + "." + orig_filename_list[orig_filename_list.length - 1];

        var f_path = "data/users/" + page.site_info.auth_address + "/" + filename;

        page.checkOptional(false, () => {
            page.cmd("bigfileUploadInit", [f_path, file.size], (init_res) => {
                var formdata = new FormData();
                formdata.append(file.name, file);

                var req = new XMLHttpRequest();

                req.upload.addEventListener("progress", console.log);
                req.upload.addEventListener("loadend", () => {
                    page.cmd("wrapperNotification", ["info", "Upload finished!"]);
                    if (f !== null && typeof f === "function") f(f_path);
                });
                req.withCredentials = true;
                req.open("POST", init_res.url);
                req.send(formdata);
            });
        });
    }
}

page = new ZeroApp();

var Models = require("./models.js");

// Router Pages
var Home = require("./router_pages/home.js");

var Help = require("./router_pages/help.js");
var Search = require("./router_pages/search.js");

var Topics = require("./router_pages/topics.js");
var TopicSlug = require("./router_pages/topic_slug.js");
var TagSlug = require("./router_pages/tag_slug.js");

var Newstory = require("./router_pages/newstory.js");
var EditStory = require("./router_pages/edit_story.js");
var ResponseFullscreenEditor = require("./router_pages/response_fullscreen_editor.js");

var MeSettings = require("./router_pages/me_settings.js");
var MeStories = require("./router_pages/me_stories.js");
var Profile = require("./router_pages/profile.js");
var ResponseFullscreen = require("./router_pages/response_fullscreen.js");
var ProfileStory = require("./router_pages/profile_story.js");

VueZeroFrameRouter.VueZeroFrameRouter_Init(app, [
    { route: "help", component: Help },
    { route: "search", component: Search },
	{ route: "topics", component: Topics },
    { route: "topic/:slug", component: TopicSlug },
    { route: "tag/:slug", component: TagSlug },
    { route: "me/settings", component: MeSettings },
    { route: "me/newstory", component: Newstory },
    { route: "me/stories/:slug/edit", component: EditStory },
    { route: "me/stories", component: MeStories },
    { route: ":userauthaddress/response/:id/response", component: ResponseFullscreenEditor },
    { route: ":userauthaddress/response/:id", component: ResponseFullscreen },
    { route: ":userauthaddress/:slug/response", component: ResponseFullscreenEditor },
    { route: ":userauthaddress/:slug", component: ProfileStory },
    { route: ":userauthaddress", component: Profile }, // TODO: Have tabs use "&tab="?
    { route: "", component: Home }
]);
