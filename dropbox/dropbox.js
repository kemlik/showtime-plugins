/**
 *  Copyright (C) 2011-2014 Andreas Öman, lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function(plugin) {
    var OAUTH_CONSUMER_KEY='qu2ctt42e52yfh3';
    var OAUTH_CONSUMER_SECRET='h26qrtan40ufbfa';
    var logo = plugin.path + 'logo.png';
    var doc, API = 'https://api.dropbox.com/1/';

    var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';

    function colorStr(str, color) {
        return '<font color="' + color + '"> (' + str + ')</font>';
    }

    function coloredStr(str, color) {
        return '<font color="' + color + '">' + str + '</font>';
    }

    plugin.createService(plugin.getDescriptor().title, 'dropbox:browse:/', 'other', true, logo);
  
    var store = plugin.createStore('authinfo', true);

    var settings = plugin.createSettings(plugin.getDescriptor().title, logo, plugin.getDescriptor().synopsis);
    settings.createAction('clearAuth', 'Unlink from Dropbox...', function() {
        store.access_token = '';
        showtime.notify('Showtime is unlinked from Dropbox', 3, '');
    });

    function bytesToSize(bytes) {
        var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        if (bytes == 0) return '0 Byte';
        var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
    };

    plugin.addURI("dropbox:browse:(.*)", function(page, path) {
        page.type = "directory";
        page.content = "items";
        page.loading = true;

        if (!store.access_token) {
            var html = showtime.httpReq('http://dropbox.com/1/oauth2/authorize?response_type=code&client_id=' + OAUTH_CONSUMER_KEY).toString();
            page.loading = false;

            while (1) {
                var credentials = plugin.getAuthCredentials(plugin.getDescriptor().synopsis, 'Please enter email and password to authorize Showtime', true, false, true);
                if (credentials.rejected) {
                    page.error('Cannot login to ' + plugin.getDescriptor().title);
                    return;
                }

                if (credentials.username && credentials.password) {
                    page.loading = true;
                    var doc = showtime.httpReq('https://www.dropbox.com/ajax_login', {
                        postdata: {
                            't': html.match(/name="t" value="([\s\S]*?)"/)[1],
                            'login_email': credentials.username,
                            'login_password': credentials.password,
                            'recaptcha_public_key': html.match(/name="recaptcha_public_key" value="([\s\S]*?)"/)[1]
                        }
                    });
                    page.loading = false;
                }

                try {
                    showtime.JSONDecode(doc)
                } catch(noerr) {
                    continue;
                }
                break;
            }
            page.loading = true;
            doc = showtime.httpReq('https://www.dropbox.com/1/oauth2/authorize_submit', {
                postdata: {
                    't': showtime.JSONDecode(doc).csrf_token,
                    'allow_access': 1,
                    'context': '{"response_type":"code","client_id":"'+OAUTH_CONSUMER_KEY+'"}',
                    'user_id': showtime.JSONDecode(doc).id
                }
            }).toString();

            doc = showtime.httpReq(API + 'oauth2/token', {
                postdata: {
                    'grant_type': 'authorization_code',
                    'code': doc.match(/id="auth-code">([\s\S]*?)<\/div>/)[1],
                    'client_id': OAUTH_CONSUMER_KEY,
                    'client_secret': OAUTH_CONSUMER_SECRET
                }
            });
            var json = showtime.JSONDecode(doc);
            if (json.access_token)
               store.access_token = json.access_token;
        }

        try {
            doc = showtime.JSONDecode(showtime.httpReq(API + 'metadata/dropbox' + path + '?access_token=' + store.access_token));
        } catch(err) {
            store.access_token = '';
            page.error(err);
            return;
        }
        page.loading = false;

        if (!doc.is_dir) {
            page.error("Browsing non directory item");
            return;
        }
        var title = doc.path.split('/');
        if (doc.path == '/') {
            page.metadata.title = 'Dropbox Root';
            page.loading = true;
            var json = showtime.JSONDecode(showtime.httpReq(API + 'account/info?access_token=' + store.access_token));
            page.loading = false;
            page.appendPassiveItem('video', '', {
                title: new showtime.RichText(coloredStr('Account info', orange)),
                description: new showtime.RichText(
                    coloredStr('\nDisplay name: ', orange) + json.display_name +
                    coloredStr('\nEmail: ', orange) + json.email +
                    coloredStr('\nCountry: ', orange) + json.country +
                    coloredStr('\nQuota: ', orange) + bytesToSize(json.quota_info.quota) +
                    coloredStr('\nUsed: ', orange) + bytesToSize(json.quota_info.normal) +
                    coloredStr('\nShared: ', orange) + bytesToSize(json.quota_info.shared) +
                    coloredStr('\nUID: ', orange) + json.uid +
                    coloredStr('\nReferral link: ', orange) + json.referral_link
                )
            });
        } else
            page.metadata.title = title[title.length-1];
        ls(page, doc.contents);
    });

    function ls(page, json) {
        // folders first
        for (var i in json) {
            if (json[i].is_dir) {
                var title = json[i].path.split('/');
                title = title[title.length-1]
                page.appendItem("dropbox:browse:" + showtime.pathEscape(json[i].path), "directory", {
                    title: new showtime.RichText(title + colorStr(json[i].modified.replace(/ \+0000/, ''), orange))
	        });
                page.entries++;
            }

        }

        // then files
        for (var i in json) {
            if (!json[i].is_dir) {
                var title = json[i].path.split('/');
                title = title[title.length-1]
                var url = 'https://api-content.dropbox.com/1/files/dropbox' + showtime.pathEscape(json[i].path) + '?access_token=' + store.access_token;
                if (json[i].path.split('.').pop().toUpperCase() == 'PLX')
                    url = 'navi-x:playlist:playlist:' + escape(url)
                var type = json[i].mime_type.split('/')[0];

	        page.appendItem(url, type, {
	            title: new showtime.RichText(title + colorStr(json[i].size, blue) + ' ' + json[i].modified.replace( /\+0000/, ''))
	        });
                page.entries++;
            }
        }
    }

    plugin.addSearcher(plugin.getDescriptor().title, logo, function(page, query) {
        page.entries = 0;
        page.loading = true;
        var json = showtime.JSONDecode(showtime.httpReq(API + 'search/auto/', {
            args: {
                access_token: store.access_token,
                query: query
            }
        }));
        page.loading = false;
        ls(page, json);
    });
})(this);