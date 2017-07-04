/**
Runnable examples functionality

Copyright: 2012 by Digital Mars

License:   http://boost.org/LICENSE_1_0.txt, Boost License 1.0

Authors:   Andrei Alexandrescu, Damian Ziemba
*/

/**
Script workflow:

1. Scan current document DOM tree for <pre> elements with class=d_code.
    <pre class="d_code">...</pre> blocks are generated by DDOC example sections.
2. Iterate each pre element and apply our custom form, replacing default <pre> block
3. Get text from original <pre> block, strip any spaces and newlines from it and compute md5sum
4. Look up mainPage map with md5sum as a key and see if there are any elements associated with this key
5. If yes: Add to our custom form default Standard input and/or Standard Arguments, stdin being 0 key, stdout 1 key.
6. If no: Just skip to point 7
7. Continue to next <pre> element and repeat begging from point 2 if there are still nodes left

How to add new example or update existing:

If example doesn't require any standard input neither standard argugments by default you are done.
Otherwise, copy example text without example separator ie:

------
[start here]
import std.stdio;

void main(string[] args) {
    writeln("Hello world. ", args);
    writeln("What's your name?");
    writeln("Hello ", readln());
}
[end here]
------

TL;DR
All examples are replaced with custom form by default. You need to do additional work only if you wan't
your example to have deafault standard input or default standard arguments.
*/

var nl2br = function()
{
    return this.replace(/\n/g, "<br>");
}

function safeVar(data, path)
{
    var p = path.split(".");
    var res = null;

    try
    {
        res = data[p[0]][p[1]];
        if (typeof res == "object")
            res = "";
    }
    catch (e)
    {
        return "";
    }

    return res;
}

var backends = {
  dpaste: {
    url: "https://dpaste.dzfl.pl/request/",
    contentType: "application/x-www-form-urlencoded; charset=UTF-8",
    requestTransform: function(data) {
      return data;
    },
    parseOutput: function(data, opts) {
      var r = {};
      if (data.compilation === "undefined")
        return null;
      r.cout = safeVar(data, "compilation.stdout");
      r.stdout = safeVar(data, "runtime.stdout");
      r.stderr = safeVar(data, "runtime.stderr");
      r.ctime = parseInt(safeVar(data, "compilation.time"));
      r.rtime = parseInt(safeVar(data, "runtime.time"));
      r.cstatus = parseInt(safeVar(data, "compilation.status"));
      r.rstatus = parseInt(safeVar(data, "runtime.status"));
      r.cerr = safeVar(data, "compilation.err");
      r.rerr = safeVar(data, "runtime.err");
      r.defaultOutput = data.output || opts.defaultOutput;
      return r;
    }
  },
  tour: {
    url: "https://tour.dlang.org/api/v1/run",
    // send json as text/plain to avoid an additional preflight OPTIONS request
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS#Preflighted_requests
    contentType: "text/plain; charset=UTF-8",
    requestTransform: function(data) {
        return JSON.stringify({
            source: data.code
        });
    },
    parseOutput: function(data, opts) {
      var r = {};
      if (data.success === "undefined") {
        return null;
      }
      r.cout = data.success === false ? data.output : "";
      r.stdout = data.success === true ? data.output : "";
      r.stderr = "";
      r.ctime = "";
      r.rtime = "";
      r.cstatus = data.errors.length === 0 ? 0 : 1;
      r.rstatus = data.success === true ? 0 : 1;
      r.cerr = "";
      r.rerr = "";
      r.defaultOutput = data.output || opts.defaultOutput;
      return r;
    }
  }
};

function parseOutput(res, o, oTitle)
{
    if (!res)
    {
        o.text("Temporarily unavailable");
        return;
    }

    var output = "";
    var defaultOutput = res.defaultOutput || '-- No output --';

    if (res.cstatus != 0)
    {
        oTitle.text("Compilation output ("+res.cstatus+": "+res.cerr+")");
        if ($.browser.msie)
            o.html(nl2br(res.cout));
        else
            o.text(res.cout);

        return;
    }
    else
    {
        oTitle.text("Application output");// (compile "+ctime+"ms, run "+rtime+"ms)");
        if ( res.cout != "")
            output = 'Compilation output: \n' + res.cout + "\n";

        output += (res.stdout == "" && res.stderr == "" ? res.defaultOutput : res.stdout);

        if (res.stderr != "")
            output += res.stderr;

        if (res.rstatus != 0)
            oTitle.text("Application output ("+res.rstatus+": "+res.rerr+")");
    }

    if ($.browser.msie)
        o.html(nl2br(res.cout));
    else
        o.text(output);
}

$(document).ready(function()
{
    setUpExamples();

    var currentPage = $(location).attr('pathname');

    $('.runnable-examples').each(function(index)
    {
        var root = $(this);
        var el = root.children("pre");
        var stripedText = el.text().replace(/\s/gm,'');

        var stdin = root.children(".runnable-examples-stdin").text();
        var args = root.children(".runnable-examples-args").text();

        // only show stdin or args if they are set
        if (stdin.length > 0)
        {
            stdin = '<div class="d_code_stdin"><span class="d_code_title">Standard input</span><br>'
                  + '<textarea class="d_code_stdin">'+stdin+'</textarea></div>';
        }
        if (args.length > 0)
        {
            args = '<div class="d_code_args"><span class="d_code_title">Command line arguments</span><br>'
                + '<textarea class="d_code_args">'+args+'</textarea></div>';
        }

        var currentExample = el;
        var orig = currentExample.html();

        currentExample.replaceWith(
            '<div class="d_code"><pre class="d_code">'+orig+'</pre></div>'
            + '<div class="d_run_code">'
            + '<textarea class="d_code" style="display: none;"></textarea>'
            + stdin + args
            + '<div class="d_code_output"><span class="d_code_title">Application output</span><br><pre class="d_code_output" readonly>Running...</pre></div>'
            + '<input type="button" class="editButton" value="Edit">'
            + (args.length > 0 ? '<input type="button" class="argsButton" value="Args">' : '')
            + (stdin.length > 0 ? '<input type="button" class="inputButton" value="Input">' : '')
            + '<input type="button" class="runButton" value="Run">'
            + '<input type="button" class="resetButton" value="Reset"></div>'
        );
    });

    $('textarea[class=d_code]').each(function(index) {
        var parent = $(this).parent();
        var outputDiv = parent.children("div.d_code_output");
        setupTextarea(this, {parent: parent, outputDiv: outputDiv,
                        stdin: true, args: true});
    });
});

function setupTextarea(el, opts)
{
    opts = opts || {};
    // set default opts
    opts = jQuery.extend({}, {
        stdin: false,
        args: false,
        transformOutput: function(out) { return out }
    }, opts);

    var backend = backends[opts.backend || "dpaste"];

    if (!!opts.parent)
        var parent = opts.parent;
    else
        console.error("parent node node not found");

    if (!!opts.outputDiv)
        var outputDiv = opts.outputDiv;
    else
        console.error("outputDiv node not found");

    var thisObj = $(el);
    parent.css("display", "block");
    var orgSrc = parent.parent().children("div.d_code").children("pre.d_code");

    var prepareForMain = function()
    {
        var src = $.browser.msie && $.browser.version < 9.0 ? orgSrc[0].innerText : orgSrc.text();
        var arr = src.split("\n");
        var str = "";
        for ( i = 0; i < arr.length; i++)
        {
            str += arr[i]+"\n";
        }
        if ($.browser.msie && $.browser.version < 9.0)
            str = str.substr(0, str.length - 1);
        else
            str = str.substr(0, str.length - 2);

        return str;
    };

    var editor = CodeMirror.fromTextArea(thisObj[0], {
        lineNumbers: true,
        tabSize: 4,
        indentUnit: 4,
        indentWithTabs: true,
        mode: "text/x-d",
        lineWrapping: true,
        theme: "eclipse",
        readOnly: false,
        matchBrackets: true
    });

    editor.setValue(prepareForMain());

    var height = function(diff) {
        var par = code != null ? code : parent.parent().children("div.d_code");
        return (parseInt(par.css('height')) - diff) + 'px';
    };

    var runBtn = parent.children(".runButton");
    var editBtn = parent.children(".editButton");
    var resetBtn = parent.children(".resetButton");
    var openInEditorBtn = parent.children(".openInEditorButton");

    var code = $(editor.getWrapperElement());
    code.css('display', 'none');

    var plainSourceCode = parent.parent().children("div.d_code");

    var output = outputDiv.children("pre.d_code_output");
    var outputTitle = outputDiv.children("span.d_code_title");
    if (opts.args) {
        var argsBtn = parent.children("input.argsButton");
        var argsDiv = parent.children("div.d_code_args");
        var args = argsDiv.children("textarea.d_code_args");
        var orgArgs = args.val();
    }
    if (opts.stdin) {
        var inputBtn = parent.children("input.inputButton");
        var stdinDiv = parent.children("div.d_code_stdin");
        var stdin = stdinDiv.children("textarea.d_code_stdin");
        var orgStdin = stdin.val();
    }

    var hideAllWindows = function(optArguments)
    {
        optArguments = optArguments || {};
        if (opts.stdin) {
            stdinDiv.css('display', 'none');
        }
        if (opts.args) {
            argsDiv.css('display', 'none');
        }
        outputDiv.css('display', 'none');
        if (!optArguments.keepPlainSourceCode) {
          plainSourceCode.css('display', 'none');
        }
        if (!optArguments.keepCode) {
          code.css('display', 'none');
        }
    };

    if (opts.args) {
        argsBtn.click(function(){
            resetBtn.css('display', 'inline-block');
            args.css('height', height(31));
            hideAllWindows();
            argsDiv.css('display', 'block');
            args.focus();
        });
    }

    if (opts.stdin) {
        inputBtn.click(function(){
            resetBtn.css('display', 'inline-block');
            stdin.css('height', height(31));
            hideAllWindows();
            stdinDiv.css('display', 'block');
            stdin.focus();
        });
    }

    editBtn.click(function(){
        resetBtn.css('display', 'inline-block');
        hideAllWindows();
        code.css('display', 'block');
        editor.refresh();
        editor.focus();
    });
    resetBtn.click(function(){
        resetBtn.css('display', 'none');
        editor.setValue(prepareForMain());
        if (opts.args) {
            args.val(orgArgs);
        }
        if (opts.stdin) {
            stdin.val(orgStdin);
        }
        hideAllWindows();
        plainSourceCode.css('display', 'block');
    });
    runBtn.click(function(){
        resetBtn.css('display', 'inline-block');
        $(this).attr("disabled", true);
        var optArguments = {};
        // check what boxes are currently open
        if (opts.keepCode) {
          optArguments.keepCode = code.is(":visible");
          optArguments.keepPlainSourceCode = plainSourceCode.is(":visible");
        }
        hideAllWindows(optArguments);
        output.css('height', opts.outputHeight || height(31));
        outputDiv.css('display', 'block');
        outputTitle.text("Application output");
        output.html("Running...");
        output.focus();

        var data = {
          code: opts.transformOutput(editor.getValue())
        };
        if (opts.stdin) {
            data.stdin = stdin.val();
        }
        if (opts.args) {
            data.args = args.val();
        }
        $.ajax({
            type: 'POST',
            url: backend.url,
            contentType: backend.contentType,
            dataType: "json",
            data: backend.requestTransform(data),
            success: function(data)
            {
                parseOutput(backend.parseOutput(data, opts), output, outputTitle);
                runBtn.attr("disabled", false);
            },
            error: function(jqXHR, textStatus, errorThrown )
            {
                output.html("Temporarily unavailable");
                if (typeof console != "undefined")
                {
                    console.log(textStatus + ": " + errorThrown);
                }

                runBtn.attr("disabled", false);
            }
        });
    });
    openInEditorBtn.click(function(){
      var url = "https://run.dlang.io?source=" + encodeURIComponent(opts.transformOutput(editor.getValue()));
      window.open(url, "_blank");
    });
    return editor;
};


function setUpExamples()
{
    /* Sets up expandable example boxes.
     * max-height and CSS transitions are used to animate the closing and opening for smooth animations even on less powerful devices
     */
    $('.example-box').each(function() {
        var $box = $(this);
        var boxId = $box.attr('id');
        // A little juggling here because the content needs to be a block element and the control needs to be an inline
        // element in the previous paragraph.
        var $control = $('#' + boxId + '-control');
        $control.attr('aria-controls', boxId);
        var $showLabel = $('<span>Show example <i class="fa fa-caret-down"></i></span>');
        var $hideLabel = $('<span>Hide example <i class="fa fa-caret-up"></i></span>');
        function toggle() {
            if ($box.attr('aria-hidden') === 'true') {
                $box.attr('aria-hidden', false);
                $control.attr('aria-expanded', true);
                $control.empty().append($hideLabel);
                $box.css('max-height', $box[0].scrollHeight);
            } else {
                $box.attr('aria-hidden', true);
                $control.attr('aria-expanded', false);
                $control.empty().append($showLabel);
                $box.css('max-height', 0);
            }
            return false;
        }
        $control.on('click', toggle);
        toggle();
    });
    // NB: href needed for browsers to include the controls in the (keyboard) tab order
    $('.example-control').attr('href', '#');
}
