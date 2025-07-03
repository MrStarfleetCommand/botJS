'use strict';
$(function(){
    const version = '1.2.2';
    const botRun = {
        'canceled': false,
        'pages': [],
        'cleanup': [],
        'nsList': [],
        'library': {},
        'mode': undefined,
        'nsChecks': 0,
    };
    
    const fromKey = 'from';
    const toKey = 'to';
    const titleKey = 'title';
    const lag = 3;
    const editsPerMinute = 80;
    const continueLag = 5000;
    const api = new mw.Api();
    const username = mw.config.get('wgUserName');
    const botEditButton = $('<li><a href="#">Bot edit</a></li>');
    const nsObject = mw.config.get('wgFormattedNamespaces');
    const validNamespaces = Object.keys(nsObject).filter((ns) => ns >= 0);
    const formElements = [
        '#myModalFind',
        '#myModalReplace',
        '#myModalNamespaces',
        '#myModalSummary',
        '#myModalEdit',
        '#myModalCleanup',
        '#myModalMove',
    ];
    
    function log(value, type = 'log'){
        $('#myModalLog').prepend(`${value}\n`);
        console[type](value);
    }
    
    function reset(){
        botRun.mode = undefined;
        $(formElements.join(', ')).removeAttr('disabled');
    }
    
    $('#my-tools-menu').prepend(botEditButton);
    botEditButton.on('click', () => {
        const botName = prompt('Enter your bot name');
        const botPassword = prompt('Enter your bot password');
        
        api.get({
            'meta': 'tokens',
            'type': 'login',
        }).done(tokenData => {
            api.post({
                'action': 'login',
                'lgname': botName,
                'lgpassword': botPassword,
                'lgtoken': tokenData.query.tokens.logintoken,
                // 'assert': 'bot',
            }).done(data => {
                console.log(data);
                createModal();
                log(data.login.result);
                log(JSON.stringify(data));
                
                if (data.warnings){
                    log(`Warning: ${data.warnings.main['*']}`, 'warn');
                }
            }).fail((code, data) => {
                createModal();
                log(`Error: ${code}: ${typeof data}`, 'error');
                console.log(data);
                log(JSON.stringify(data));
            });
        });
    });
    
    function txtArea(id, txt = ''){
        const disabled = (id === 'myModalLog') ? ' disabled' : '';
        return $(`<textarea id="${id}" rows="4"${disabled}>`).text(txt);
    }
    
    function button(id, txt, secondary = false){
        const classes = ['wds-button'];
        if (secondary){
            classes.push('wds-is-secondary');
        }
        const classString = classes.join(' ');
        return $(`<button class="${classString}" id="${id}">`).text(txt);
    }
    
    function createModal(){
        $('#myModal').on('submit', submitForm);
        $('#myModalEdit').on('click', edit);
        $('#myModalCleanup').on('click', cleanup);
        $('#myModalMove').on('click', move);
        $('#myModalCancel').on('click', cancel);
        $('#myModalClose').on('click', close);
    }
    
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
    
    function close(){
        cancel();
        log('Closing bot interface . . .');
    }
    
    function initalizer(){
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
        botRun.nsList = nsAll.filter((ns) => validNamespaces.indexOf(ns) >= 0);
        
        if (!botRun.monolith && botRun.mode !== 'move'){
            $.getJSON('https://community.fandom.com/api.php?callback=?', {
                'action': 'query',
                'generator': 'allpages',
                'gapfrom': 'Mr. Starfleet Command/bot.json',
                'gapto': 'Mr. Starfleet Command/bot.json',
                'gapnamespace': 2,
                'prop': 'revisions',
                'rvprop': 'content',
                'rvslots': 'main',
                'formatversion': 2,
                'format': 'json',
            }).done((output) => {
                const rev = output.query.pages[0].revisions[0];
                botRun.monolith = JSON.parse(rev.slots.main.content);
                nsLooper();
            });
        } else {
            nsLooper();
        }
    }
    
    function nsLooper(){
        let local;
        let crossWiki;
        if (botRun.mode !== 'move'){
            const server = mw.config.get('wgServerName');
            const lang = mw.config.get('wgContentLanguage');
            local = botRun.monolith.wiki[`${server}/${lang}`] || {};
            crossWiki = botRun.monolith.general;
            const catchAll = crossWiki['-1'];
            const localAll = local['-1'];
            botRun.library['-1'] = catchAll.concat(localAll);
            botRun.library['-1'] = localAll ? botRun.library['-1'] : catchAll;
        }
        
        botRun.nsList.forEach((ns) => {
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
    
    function searchWiki(ns, continueParameter){
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
        
        api.get(searchWikiParams).done((result) => {
            if (result.warnings){
                log(`Warning: ${result.warnings.main['*']}`, 'warn');
            }
            
            if (result.query){
                result.query.pages.forEach((entry) => {
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
                        : [username];
                    
                    const notNoBots = pageContent.search(nobots1) === -1;
                    const notBotsAllowNone = pageContent.search(nobots2) === -1;
                    const notBotsDenyAll = pageContent.search(nobots3) === -1;
                    const botNotDenied = deniedBots.indexOf(username) === -1;
                    const botAllowed = allowedBots.indexOf(username) !== -1;
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
                        
                        appears = !botRun.cleanup.every((x) => x === -1);
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
            }
            
            if (botRun.canceled){
                return;
            }
            
            if (result['continue']){
                searchWiki(ns, result['continue'].gapcontinue);
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
        }).fail((code, data) => {
            console.error(searchWikiParams);
            if (code === 'http'){
                log(`Error: ${code}: ${JSON.stringify(data)}`, 'error');
            } else {
                log(`Error: ${code}: ${typeof data}`, 'error');
            }
        });
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
            };
        } else {
            const text = botRun.pages[i].content;
            const newText = text.replace(botRun.find, botRun.replace);
            const editMode = botRun.mode === 'edit';
            const cleanupMode = botRun.mode === 'cleanup';
            let finalText = newText;
            
            botRun.library[botRun.pages[i].namespace].forEach((pair) => finalText = finalText.replace(RegExp(pair.find, 'gm'), pair.replace));
            
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
            };
        }
        
        submitAction(params, i);
    }
    
    function submitAction(params, i){
        if (botRun.canceled){
            return;
        }
        
        api.postWithToken('csrf', params).done((data) => {
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
            
            if (data.warnings){
                log(`Warning: ${data.warnings.main['*']}`, 'warn');
            }
            
            if (data.edit){
                log(`${i + 1}/${botRun.pages.length}: ${data.edit.result}: "${data.edit.title}"`);
            } else if (data.move){
                log(`${i + 1}/${botRun.pages.length}: "${data.move[fromKey]}" to "${data.move[toKey]}"`);
            } else {
                log(JSON.stringify(data));
            }
            
            next(0, i);
        }).fail((code, data) => {
            const title = (botRun.mode === 'move') ? params[fromKey] : params[titleKey];
            const errorPrefix = `${i + 1}/${botRun.pages.length}: Error: ${code}: "${title}": `;
            
            if (code === 'maxlag'){
                log(errorPrefix + data.error.info, 'error');
                resubmit(params, i);
            } else if (code === 'protectedpage'){
                log(errorPrefix + data.error.info, 'error');
                next(continueLag, i);
            } else if (code === 'ratelimited'){
                log(errorPrefix + data.error.info, 'error');
                resubmit(params, i);
            } else if (code === 'http'){
                log(errorPrefix + JSON.stringify(data), 'error');
                resubmit(params, i);
            } else if (code === 'permissiondenied'){
                log(errorPrefix + 'This page is in a protected namespace.', 'error');
                next(continueLag, i);
            } else if (code === 'readonly'){
                log(errorPrefix + `${data.error.info} Reason: ${data.error.readonlyreason}`, 'error');
                resubmit(params, i);
            } else if (code === 'articleexists'){
                log(errorPrefix + data.error.info, 'error');
                next(continueLag, i);
            } else if (code === 'editconflict'){
                log(errorPrefix + JSON.stringify(data), 'error');
            } else if (code === 'The_page_you_wanted_to_save_was_blocked_by_the_spam_filter__br___This_is_probably_caused_by_a_blacklisted_link_or_pagename__p_Block_ID__492211__p_Your_content_triggered_the_spam_filter_for_the_following_reason_____Due_to___w_Help_Spam_spam_issues____URL_shorteners_are_not_allowed_in_Fandom_network__Please_replace_all_URL_shorteners_in_the_entire_page_for_process_the_editing______If_you_think_this_is_wrong__please_contact_us___w_c_vstf_Report_Spam_filter_problems_here____Please__provide_a_copy_of_this_message_when_reporting_any_problem_'){
                log(`${i + 1}/${botRun.pages.length}: Error: Spam filter: "${title}": Block ID #492211: URL shorteners present in wikitext`, 'error');
                next(continueLag, i);
            } else {
                log(errorPrefix + typeof data, 'error');
            }
        });
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
});
