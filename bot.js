'use strict';
(async () => {
    const version = '2.1.10 (alpha)';
    const botRun = {
        'canceled': false,
        'pages': [],
        'cleanup': [],
        'nsList': [],
        'library': {},
        'mode': undefined,
        'nsChecks': 0,
        'validNamespaces': [],
        'username': undefined,
        'tokens': {},
    };
    
    document.querySelector('h1').innerText = `botJS, version ${version}`;
    console.log(`botJS, version ${version}`);
    let wiki;
    const lag = 3;
    const editsPerMinute = 80;
    const continueLag = 5000;
    const wikiDropDown = document.getElementById('myModalWiki');
    const formElements = [
        '#myModalFind',
        '#myModalReplace',
        '#myModalNamespaces',
        '#myModalSummary',
        '#myModalEdit',
        '#myModalCleanup',
        '#myModalMove',
    ];
    
    $(formElements.join(', ')).attr('disabled', true);
    $('#myModalPickWiki').on('click', async () => {
        $('#myModalWiki, #myModalPickWiki').attr('disabled', true);
        wiki = wikiDropDown.value;
        const nsListAll = await api.get({
            'meta': 'siteinfo',
            'siprop': 'namespaces',
        });
        botRun.validNamespaces = Object.keys(nsListAll.query.namespaces).filter(ns => ns >= 0);
        document.getElementById('myModalNamespaces').value = botRun.validNamespaces.join('\n');
        
        botRun.username = prompt('Enter your bot\'s username');
        const botName = prompt('Enter your bot name');
        const botPassword = prompt('Enter your bot password');
        alert(`${wiki}/api.php?action=query&meta=tokens&type=csrf|login`);
        botRun.tokens.csrftoken = prompt('Enter the csrf token');
        botRun.tokens.logintoken = prompt('Enter the login token');
        
        const loginData = await api.post({
            'action': 'login',
            'lgname': `${botRun.username}@${botName}`,
            'lgpassword': botPassword,
            'lgtoken': botRun.tokens.logintoken,
        });
        
        log(JSON.stringify(loginData));
        console.log(loginData);
        
        if (loginData.error){
            log(`Error: ${typeof loginData}`, 'error');
        }
        
        if (loginData.warnings){
            log(`Warning: ${loginData.warnings.main['*']}`, 'warn');
        }
        
        if (loginData.login){
            log(loginData.login.result);
            reset();
        }
    });
    
    class Api {
        constructor(){
            this.get = async (params, baseURL = wiki) => {
                params.format = 'json';
                params.origin = '*';
                if (!params.action){
                    params.action = 'query';
                }
                
                const queryString = new URLSearchParams(params).toString();
                const url = `${baseURL}/api.php?${queryString}`;
                const response = await fetch(url);
                const data = await response.json();
                return data;
            };
            this.post = async (params, baseURL = wiki) => {
                params.format = 'json';
                params.origin = '*';
                if (!params.action){
                    params.action = 'query';
                }
                
                const queryString = new URLSearchParams(params).toString();
                const url = `${baseURL}/api.php?${queryString}`;
                const headers = new Headers();
                headers.set('Content-Type', 'text/html; charset=utf-8');
                const response = await fetch(url, {
                    'method': 'POST',
                    'headers': headers,
                });
                const data = await response.json();
                return data;
            };
        }
    }
    
    const api = new Api();
    
    function log(value, type = 'log'){
        $('#myModalLog').prepend(`${value}\n`);
        console[type](value);
    }
    
    function reset(){
        botRun.mode = undefined;
        $(formElements.join(', ')).removeAttr('disabled');
    }
    
    $('#myModal').on('submit', submitForm);
    $('#myModalEdit').on('click', edit);
    $('#myModalCleanup').on('click', cleanup);
    $('#myModalMove').on('click', move);
    $('#myModalCancel').on('click', cancel);
    
    function submitForm(e){
        e.preventDefault();
    }
    
    function edit(){
        botRun.mode = 'edit';
        botRun.canceled = false;
        initalizer();
    }
    
    function cleanup(){
        botRun.mode = 'cleanup';
        botRun.canceled = false;
        initalizer();
    }
    
    function move(){
        botRun.mode = 'move';
        botRun.canceled = false;
        initalizer();
    }
    
    function cancel(){
        reset();
        botRun.canceled = true;
        log('Cancelling bot run . . .');
    }
    
    async function initalizer(){
        if (botRun.canceled){
            return;
        }
        
        log(`Searching in progress (mode: ${botRun.mode}) . . .`);
        $(formElements.join(', ')).attr('disabled', true);
        const nsAll = $('#myModalNamespaces').val().split('\n');
        botRun.pages = [];
        botRun.library = {};
        botRun.find = RegExp($('#myModalFind').val(), 'gm');
        botRun.replace = $('#myModalReplace').val();
        botRun.summary = $('#myModalSummary').val();
        botRun.nsList = nsAll.filter(ns => botRun.validNamespaces.indexOf(ns) >= 0);
        
        if (!botRun.monolith && botRun.mode !== 'move'){
            const cleanupFile = await api.get({
                'generator': 'allpages',
                'gapfrom': 'Mr. Starfleet Command/bot.json',
                'gapto': 'Mr. Starfleet Command/bot.json',
                'gapnamespace': 2,
                'prop': 'revisions',
                'rvprop': 'content',
                'rvslots': 'main',
                'formatversion': 2,
            }, 'https://community.fandom.com');
            
            const rev = cleanupFile.query.pages[0].revisions[0];
            botRun.monolith = JSON.parse(rev.slots.main.content);
            nsLooper();
        } else {
            nsLooper();
        }
    }
    
    function nsLooper(){
        let local;
        let crossWiki;
        if (botRun.mode !== 'move'){
            local = botRun.monolith.wiki[wiki] || {};
            crossWiki = botRun.monolith.general;
            const catchAll = crossWiki['-1'];
            const localAll = local['-1'];
            botRun.library['-1'] = catchAll.concat(localAll);
            botRun.library['-1'] = localAll ? botRun.library['-1'] : catchAll;
        }
        
        botRun.nsList.forEach(ns => {
            if (botRun.mode !== 'move' && local[ns] && crossWiki[ns]){
                const nsLib = local[ns].concat(crossWiki[ns]);
                botRun.library[ns] = botRun.library['-1'].concat(nsLib);
            } else if (botRun.mode !== 'move' && local[ns]){
                botRun.library[ns] = botRun.library['-1'].concat(local[ns]);
            } else if (botRun.mode !== 'move' && crossWiki[ns]){
                botRun.library[ns] = botRun.library['-1'].concat(crossWiki[ns]);
            } else if (botRun.mode !== 'move'){
                botRun.library[ns] = botRun.library['-1'];
            }
            
            searchWiki(ns);
        });
    }
    
    async function searchWiki(ns, continueParameter){
        const searchWikiParams = {
            'generator': 'allpages',
            'gapnamespace': ns,
            'gaplimit': 500,
            'prop': 'revisions',
            'rvprop': 'content',
            'rvslots': 'main',
            'formatversion': 2,
            'gapcontinue': continueParameter,
        };
        
        const searchBatch = await api.get(searchWikiParams);
        
        if (searchBatch.error){
            console.error(searchWikiParams);
            if (searchBatch.error.code === 'http'){
                log(`Error: ${searchBatch.error.code}: ${JSON.stringify(searchBatch)}`, 'error');
            } else {
                log(`Error: ${searchBatch.error.code}: ${typeof searchBatch}`, 'error');
            }
        }
        
        if (searchBatch.warnings){
            log(`Warning: ${searchBatch.warnings.main['*']}`, 'warn');
        }
        
        if (searchBatch.query){
            searchBatch.query.pages.forEach(entry => {
                if (botRun.canceled){
                    return;
                }
                
                botRun.cleanup = [];
                const pageTitle = entry.title;
                const pageContent = entry.revisions[0].slots.main.content;
                const cm = entry.revisions[0].slots.main.contentmodel;
                const deniedBotsRegexp = /\{\{[Bb]ots\|deny=.+?\}\}/;
                const denySplit = pageContent.split(/\{\{[Bb]ots\|deny=/);
                const allowedBotsRegexp = /\{\{[Bb]ots\|allow=.+?\}\}/;
                const allowSplit = pageContent.split(/\{\{[Bb]ots\|allow=/);
                const nobots1 = /\{\{[Nn]obots\}\}/;
                const nobots2 = /\{\{[Bb]ots\|allow=none\}\}/;
                const nobots3 = /\{\{[Bb]ots\|deny=all\}\}/;
                
                const deniedBots =
                    (pageContent.search(deniedBotsRegexp) !== -1) ?
                    denySplit[1].split('}}')[0].split(',')
                    : [];
                
                const allowedBots =
                    (pageContent.search(allowedBotsRegexp) !== -1) ?
                    allowSplit[1].split('}}')[0].split(',')
                    : [botRun.username];
                
                const notNoBots = pageContent.search(nobots1) === -1;
                const notBotsAllowNone = pageContent.search(nobots2) === -1;
                const notBotsDenyAll = pageContent.search(nobots3) === -1;
                const botNotDenied = deniedBots.indexOf(botRun.username) === -1;
                const botAllowed = allowedBots.indexOf(botRun.username) !== -1;
                const isWikitext = cm === 'wikitext';
                const authorizedBot =
                    notNoBots &&
                    notBotsAllowNone &&
                    notBotsDenyAll &&
                    botNotDenied &&
                    botAllowed;
                let appears;
                
                function cleanupTally(pair){
                    const i = pageContent.search(RegExp(pair.find, 'gm'));
                    botRun.cleanup.push(i);
                }
                
                if (botRun.mode === 'edit'){
                    appears = pageContent.search(botRun.find) !== -1;
                } else if (botRun.mode === 'cleanup'){
                    botRun.library[ns].forEach(cleanupTally);
                    appears = !botRun.cleanup.every(x => x === -1);
                } else {
                    appears = pageTitle.search(botRun.find) !== -1;
                }
                
                if (isWikitext && appears && authorizedBot){
                    const pageInformation = {
                        fullPageName: pageTitle,
                        content: pageContent,
                        namespace: ns,
                    };
                    
                    botRun.pages.push(pageInformation);
                }
            });
            
            if (botRun.canceled){
                return;
            }
            
            if (searchBatch.continue){
                searchWiki(ns, searchBatch.continue.gapcontinue);
            } else {
                botRun.nsChecks++;
            }
            
            if (botRun.nsChecks === botRun.nsList.length){
                if (!botRun.pages.length){
                    log('No pages found');
                    botRun.nsChecks = 0;
                    reset();
                } else {
                    if (botRun.canceled){
                        return;
                    }
                    
                    log('Stand by for bot run . . .');
                    botRun.iValue = 0;
                    resultsLoop(botRun.iValue++);
                }
            }
        }
    }
    
    function resultsLoop(i){
        let editSummary;
        let params;
        
        if (botRun.mode === 'move'){
            const title = botRun.pages[i].fullPageName;
            const newTitle = title.replace(botRun.find, botRun.replace);
            
            if (botRun.summary){
                editSummary = `bot: ${botRun.summary}`;
            } else {
                editSummary = '';
            }
            
            params = {
                'action': 'move',
                'from': botRun.pages[i].fullPageName,
                'to': newTitle,
                'reason': editSummary,
                'noredirect': 1,
                'maxlag': lag,
                'assert': 'bot',
                'token': botRun.tokens.csrftoken,
            };
        } else {
            const text = botRun.pages[i].content;
            const newText = text.replace(botRun.find, botRun.replace);
            const editMode = botRun.mode === 'edit';
            const cleanupMode = botRun.mode === 'cleanup';
            let finalText = newText;
            
            botRun.library[botRun.pages[i].namespace].forEach(pair => finalText = finalText.replace(RegExp(pair.find, 'gm'), pair.replace));
            
            if (finalText !== newText && editMode && botRun.summary){
                editSummary = `bot: ${botRun.summary}, cleanup`;
            } else if ((finalText !== newText && editMode) || cleanupMode){
                editSummary = 'bot: cleanup';
            } else if (editMode && botRun.summary){
                editSummary = `bot: ${botRun.summary}`;
            } else {
                editSummary = '';
            }
            
            params = {
                'action': 'edit',
                'title': botRun.pages[i].fullPageName,
                'text': finalText,
                'minor': 1,
                'bot': 1,
                'summary': editSummary,
                'maxlag': lag,
                'assert': 'bot',
                'token': botRun.tokens.csrftoken,
            };
        }
        
        submitAction(params, i);
    }
    
    async function submitAction(params, i){
        if (botRun.canceled){
            return;
        }
        
        const actionData = await api.post(params);
        /*
        {
            "edit": {
                "result": "Success",
                "pageid": 187753,
                "title": "User talk:Andrew.estes27",
                "contentmodel": "wikitext",
                "oldrevid": 3178066,
                "newrevid": 3209364,
                "newtimestamp": "2024-07-25T04:10:23Z"
            },
            "move": {
                "from": "File:2025-01-05 0000am Whatever.png",
                "to": "File:2025-01-05 0000am Who cares.png",
                "reason": "bot: punctuation"
            }
        }
        */
        
        if (actionData.error){
            const title = (botRun.mode === 'move') ? params.from : params.title;
            const errorPrefix = `${i + 1}/${botRun.pages.length}: Error: ${actionData.error.code}: "${title}": `;
            
            if (actionData.error.code === 'maxlag'){
                log(errorPrefix + actionData.error.info, 'error');
                resubmit(params, i);
            } else if (actionData.error.code === 'protectedpage'){
                log(errorPrefix + actionData.error.info, 'error');
                next(continueLag, i);
            } else if (actionData.error.code === 'ratelimited'){
                log(errorPrefix + actionData.error.info, 'error');
                resubmit(params, i);
            } else if (actionData.error.code === 'http'){
                log(errorPrefix + JSON.stringify(actionData), 'error');
                resubmit(params, i);
            } else if (actionData.error.code === 'permissiondenied'){
                log(errorPrefix + 'This page is in a protected namespace.', 'error');
                next(continueLag, i);
            } else if (actionData.error.code === 'readonly'){
                log(errorPrefix + `${actionData.error.info} Reason: ${actionData.error.readonlyreason}`, 'error');
                resubmit(params, i);
            } else if (actionData.error.code === 'articleexists'){
                log(errorPrefix + actionData.error.info, 'error');
                next(continueLag, i);
            } else if (actionData.error.code === 'editconflict'){
                log(errorPrefix + JSON.stringify(actionData), 'error');
            } else if (actionData.error.code === 'The_page_you_wanted_to_save_was_blocked_by_the_spam_filter__br___This_is_probably_caused_by_a_blacklisted_link_or_pagename__p_Block_ID__492211__p_Your_content_triggered_the_spam_filter_for_the_following_reason_____Due_to___w_Help_Spam_spam_issues____URL_shorteners_are_not_allowed_in_Fandom_network__Please_replace_all_URL_shorteners_in_the_entire_page_for_process_the_editing______If_you_think_this_is_wrong__please_contact_us___w_c_vstf_Report_Spam_filter_problems_here____Please__provide_a_copy_of_this_message_when_reporting_any_problem_'){
                log(`${i + 1}/${botRun.pages.length}: Error: Spam filter: "${title}": Block ID #492211: URL shorteners present in wikitext`, 'error');
                next(continueLag, i);
            } else {
                log(errorPrefix + typeof actionData, 'error');
            }
        }
        
        if (actionData.warnings){
            log(`Warning: ${actionData.warnings.main['*']}`, 'warn');
        }
        
        if (actionData.edit){
            log(`${i + 1}/${botRun.pages.length}: ${actionData.edit.result}: "${actionData.edit.title}"`);
            next(0, i);
        } else if (actionData.move){
            log(`${i + 1}/${botRun.pages.length}: "${actionData.move.from}" to "${actionData.move.to}"`);
            next(0, i);
        } else {
            log(JSON.stringify(actionData));
        }
    }
    
    function next(delay, i){
        if (botRun.iValue < botRun.pages.length){
            if (delay){
                setTimeout(() => resultsLoop(botRun.iValue++), delay);
            } else if ((i + 1) % editsPerMinute){
                resultsLoop(botRun.iValue++);
            } else {
                log('Pausing: Bot run will resume in 60 seconds');
                setTimeout(() => resultsLoop(botRun.iValue++), 60 * 1000);
            }
        } else {
            log('Success! Bot run completed.');
            reset();
        }
    }
    
    function resubmit(params, i){
        setTimeout(() => submitAction(params, i), continueLag);
    }
})();
