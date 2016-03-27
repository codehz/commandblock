(function(global) {
    "use strict";

    const VM = global.VM;
    const StringStream = global.StringStream;
    const parseAST = global.parseAST;
    let command,
        linenums;
    let rootVm;

    window.onload = () => {
        command = document.getElementById('command');
        linenums = document.getElementById('linenums');
        rootVm = new VM(10, 10, document.getElementById('node'));
        rootVm.delay = 500;
    };
    global.go = () => {
        let stream = new StringStream(command.value + ' END');

        rootVm.reset();
        try {
            let ast = parseAST(stream, rootVm);

            console.log(ast);
            ast.exec(rootVm, () => console.log('finish'));
        } catch (err) {
            let errorpoint = document.getElementById('errorpoint');

            errorpoint.style.marginTop = `${17 * stream.line - 14}px`;
            errorpoint.style.display = 'block';
            console.error(`Syntax error at line ${stream.line}: ${err}`);
        }
    };
    global.updateText = () => {
        let cache = '';
        let line = 1;

        for (let i = 0; i < command.value.length; i++) if (command.value[i] == '\n') {
            line++;
        }

        for (let i = 1; i <= line; i++) cache += i + '<br>';
        cache += "<div id='errorpoint'></div>";
        linenums.innerHTML = cache;
    };
    global.randomWall = () => {
        rootVm.createWall([Math.floor(Math.random() * 10), Math.floor(Math.random() * 10)]);
    };
    global.scroll = () => {
        linenums.style.marginTop = -command.scrollTop + 'px';
    };
    global.onpress = ({target: {id}}) => {
      let pos = id.match(/\d+/g).map(it => parseInt(it));
      rootVm.forceMoveTo(pos);
    };
    global.onrightclick = ({target: {id}}) => {
      let pos = id.match(/\d+/g).map(it => parseInt(it));
      rootVm.switchWall(pos);
    };
})(window);