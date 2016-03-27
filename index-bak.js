(function(global) {
  "use strict";
  var timeouts = [];
  var messageName = "zero-timeout-message";

  // Like setTimeout, but only takes a function argument.  There's
  // no time argument (always zero) and no arguments (you have to
  // use a closure).
  function setZeroTimeout(fn) {
    timeouts.push(fn);
    window.postMessage(messageName, "*");
  }

  function handleMessage(event) {
    if (event.source == window && event.data == messageName) {
      event.stopPropagation();
      if (timeouts.length > 0) {
        var fn = timeouts.shift();
        fn();
      }
    }
  }

  window.addEventListener("message", handleMessage, true);
  //修改后的取余运算
  Number.prototype.mod = function(n) {
    return ((this % n) + n) % n;
  };
  //判断是否是需要忽略的字符
  function isBreak(ch) {
    return ch === ' ' || ch === ';' || ch === ',' || ch === '\n' || ch === '\r' || ch === '';
  }
  //从对象中构造键值对数组
  function* entries(obj) {
    for (let key of Object.keys(obj)) {
      yield [key, obj[key]];
    }
  }
  Function.prototype.delay = function(time, ...params) {
    if (time)
      setTimeout(this, time, ...params);
    else
      setZeroTimeout(() => this(...params));
  };
  Function.prototype.future = function(...params) {
    setZeroTimeout(() => this(...params));
  };
  Object.defineProperty(Object.prototype, 'map', {
    value: function(f, ctx) {
      ctx = ctx || this;
      var self = this,
        result = {};
      Object.keys(self).forEach(function(k) {
        result[k] = f.call(ctx, self[k], k, self);
      });
      return result;
    }
  });
  //字符流对字符串进行拆分分析
  class StringStream {
    constructor(input) {
      function* makeStream(input, stream) {
          let back = 0; //回溯计次
          for (let i = 0; i < input.length; i++, stream.modify++) {
            let ch = input[i];
            //console.log(!ch);
            //不重复计算行数
            if (ch == '\n' && back <= 0) stream.line++;
            back--;
            let offset = yield ch;
            if (typeof offset == 'number') {
              i -= (back = offset + 1);
              stream.modify -= back;
            }
          }
        }
        //原始流
      this.stream = makeStream(input, this);
      //行数统计
      this.line = 1;
      //修改记录
      this.modify = 0;
    }

    //是否读取完毕
    isDone() {
      return this.stream.next(0).done;
    }

    //吃掉忽略的字符
    eatBreak() {
      let ch = this.stream.next();
      while (ch.done === false && isBreak(ch.value)) ch = this.stream.next();
      this.stream.next(1);
    }

    //一直跳过，直到碰到了某个字符，返回是否遇到过字符
    readOver(target) {
      this.eatBreak();
      let ch = this.stream.next();
      while (ch.done === false && ch.value != target) ch = this.stream.next();
      return ch.value == target;
    }

    //读取一个数字
    readNumber() {
      let text = this.readToken();
      if (isNaN(text)) return null;
      return parseInt(text);
    }

    //读取一个点坐标
    readPoint() {
      let point = [0, 0];
      point[0] = this.readNumber();
      if (point[0] === null) return null;
      point[1] = this.readNumber();
      if (point[1] === null) return null;
      return point;
    }

    //读取相对方向
    readRelativeDirection(fallback) {
      let way = this.readToken();
      switch (way) {
        case 'left':
        case 'lef':
          return 'left';
        case 'right':
        case 'rig':
          return 'right';
        case 'back':
        case 'bac':
          return 'back';
        default:
          if (typeof fallback == 'function') return fallback(way);
          throw '无法完成指令解析';
      }
    }

    //读取绝对方向
    readAbsoluteDirection(fallback) {
      let way = this.readToken();
      switch (way) {
        case 'left':
        case 'lef':
          return 'left';
        case 'right':
        case 'rig':
          return 'right';
        case 'top':
          return 'top';
        case 'bot':
        case 'bottom':
          return 'bottom';
        default:
          if (typeof fallback == 'function') return fallback(way);
          throw '无法完成指令解析';
      }
    }

    //读取一个token
    readToken() {
      this.eatBreak();
      let ch = this.stream.next();
      let text = '';
      while (!ch.done) {
        if (isBreak(ch.value))
          break;
        text += ch.value;
        ch = this.stream.next();
      }
      //console.log(text);
      return text.toLowerCase();
    }

    //读取一个<>作为开始和结束标志的字符串
    readString() {
      this.eatBreak();
      let ch = this.stream.next();
      if (ch.value != '<') throw '非字符串';
      ch = this.stream.next();
      let text = '';
      while (!ch.done) {
        if (ch.value == '>')
          break;
        text += ch.value;
        ch = this.stream.next();
      }
      return text;
    }

    //读取一个颜色
    readColor() {
      let temp = this.readToken();
      if (/([a-f0-9]{3}){1,2}\b/i.test(temp)) return temp;
      return null;
    }

    //设置检查点
    checkPoint() {
      this.modify = 0;
    }

    //撤销修改，回到检查点
    cancelLast() {
      //console.log(`cancel ${this.modify}`);
      this.stream.next(this.modify);
    }
  }

  //变量栈，用于模拟Scope
  class VarStack extends Array {
    find(name) {
      for (let item of this)
        if (typeof item[name] != 'undefined') return item[name];
      throw `未找到变量${name}`;
    }

    findAndSet(name, value) {
      for (let item of this)
        if (typeof item[name] != 'undefined') return (item[name] = value);
      throw `未找到变量${name}`;
    }

    //添加一层
    addLayer(obj) {
      this.unshift(obj || {});
    }

    removeLayer() {
      this.shift();
    }

    //重置（清空）
    reset() {
      this.length = 0;
    }
  }

  //虚拟机
  class VM {
    constructor(w, h, car) {
      this.data = new Array(h);
      for (let i = 0; i < w; i++)
        this.data[i] = new Array(w);
      console.log(this.data[2]);
      this.varStack = new VarStack();
      this.w = w;
      this.h = h;
      this.car = car;
      this.pos = {
        x: 0,
        y: 0
      };
      this._direction = 0;
    }

    //重置虚拟机执行状态，保留地图等物理状态
    reset() {
      this.funcs = {};
      this.callStack = [];
      this.varStack.reset();
      this.varStack.addLayer();
      this.pathfinding = null;
    }

    //得到最顶层变量层
    get defs() {
      return this.varStack[0];
    }

    //当前方向
    get direction() {
      return this._direction;
    }

    //设置方向
    set direction(value) {
      this._direction = value;
      console.log(value);
      this.updateTransform();
    }

    //调整位置
    adjustPosition() {
      let ret = true;
      if (this.pos.x < 0) {
        this.pos.x = 0;
        ret = false;
      } else if (this.pos.x >= this.w) {
        this.pos.x = this.w - 1;
        ret = false;
      }
      if (this.pos.y < 0) {
        this.pos.y = 0;
        ret = false;
      } else if (this.pos.y >= this.h) {
        this.pos.y = this.h - 1;
        ret = false;
      }
    }

    //强制移动位置
    forceMoveTo(pos) {
      this.pos = {
        x: pos[0] - 1,
        y: pos[1] - 1
      };
      let ret = this.adjustPosition();
      this.updateTransform();
      return ret;
    }

    //设置一座墙
    createWall(pos) {
      console.log(pos);
      if (pos[0] >= 0 && pos[0] < this.w && pos[1] >= 0 && pos[1] < this.h && !this.data[pos[1]][pos[0]]) {
        this.data[pos[1]][pos[0]] = 'aaa';
        this.updateWall();
        return true;
      }
      return false;
    }

    //粉刷一座墙
    brushWall(pos, color) {
      if (pos[0] >= 0 && pos[0] < this.w && pos[1] >= 0 && pos[1] < this.h && this.data[pos[1]][pos[0]]) {
        this.data[pos[1]][pos[0]] = color;
        this.updateWall();
        return true;
      }
      return false;
    }

    //检查当前位置可用性
    invalidPos() {
      return this.pos.x < 0 || this.pos.x >= this.w || this.pos.y < 0 || this.pos.y >= this.h || this.data[this.pos.y][this.pos.x];
    }

    //检查当前位置加偏移的可用性
    checkDPos(dpos) {
      let x = this.pos.x + dpos[0];
      let y = this.pos.y + dpos[1];
      return !(x < 0 || x >= this.w || y < 0 || y >= this.h || this.data[y][x]);
    }

    checkPos(pos) {
      let x = pos[0];
      let y = pos[1];
      return !(x < 0 || x >= this.w || y < 0 || y >= this.h || this.data[y][x]);
    }

    //移动位置
    move(dpos) {
      console.log(`dpos ${dpos}`);

      let ret = true;

      let ax = Math.abs(dpos[0]),
        dx = dpos[0] / ax;
      let ay = Math.abs(dpos[1]),
        dy = dpos[1] / ay;

      for (let i = 0; i < ax; i++) {
        this.pos.x += dx;
        if (this.invalidPos()) {
          this.pos.x -= dx;
          ret = false;
          break;
        }
      }
      for (let i = 0; i < ay; i++) {
        this.pos.y += dy;
        if (this.invalidPos()) {
          this.pos.y -= dy;
          ret = false;
          break;
        }
      }
      this.updateTransform();
      return ret;
    }

    //更新位置显示
    updateTransform() {
      this.car.style.marginLeft = 30 * this.pos.x + 'px';
      this.car.style.marginTop = 30 * this.pos.y + 'px';
      console.log(this.pos);
      this.car.style.transform = `rotateZ(${this._direction}deg)`;
    }

    //更新墙的显示
    updateWall() {
      for (let i = 0; i < this.h; i++) {
        for (let j = 0; j < this.w; j++) {
          if (this.data[j][i]) {
            let target = document.getElementById(`box-${i}-${j}`);
            target.style.background = `#${this.data[j][i]}`;
          }
        }
      }
    }
  }

  //抽象语法树节点
  class ASTNode {
    constructor(name) {
      this.name = name;
    }

    //解析
    parse(stream) {
      this.line = stream.line;
    }

    //执行
    exec() {
      throw "Not implemented";
    }
  }

  //名字注册器
  class NameRegister {
    constructor(target, keylist) {
      this.target = target;
      this.keylist = keylist;
    }

    //检查并创建对象
    checkAndGetType(token) {
      if (this.keylist.indexOf(token) > -1)
        return this.target;
      return null;
    }
  }

  //名字解析器
  class NameParser extends Array {
    //找对应名字的类型
    findType(name) {
      let cache = null;
      for (let item of this)
        if ((cache = item.checkAndGetType(name))) break;
      return cache;
    }

    ////寻找并创建对象，然后执行指定的操作
    findTypeAndCreateAndDo(name, func) {
      let type = this.findType(name);
      if (type) {
        let obj = new type();
        func(obj);
        return obj;
      }
      return null;
    }

    //寻找并创建对象，同时进行默认的初始化
    findTypeAndCreateIntance(name, stream, vm) {
      let type = this.findType(name);
      if (type) {
        let obj = new type();
        try {
          stream.checkPoint();
          obj.parse(stream, vm);
        } catch (e) {
          stream.cancelLast();
          throw `${obj.name}: ${e}`;
        }
        return obj;
      }
      return null;
    }
  }

  //节点解析器
  let nodeNameParser = new NameParser();
  //类型名字解析器
  let typeNameParser = new NameParser();
  //运算符名字解析器
  let operatorNameParser = new NameParser();
  //执行结果
  class ExecResult {
    constructor(done, data) {
      this.done = done;
      this.data = data;
    }

    //检查结果
    check(vm) {
      return this.data && this.data.type == 'number' && this.data.value(vm) !== 0;
    }
  }

  //直线运动节点
  class ASTGoNode extends ASTNode {
    constructor() {
      super('go');
    }

    //解析模板GO X | GO REF X
    parse(stream, vm) {
      super.parse(stream);
      try {
        this.step = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
      } catch (err) {
        this.step = {
          value: () => 1
        };
      }
    }

    exec(vm, callback) {
      //角度-方向向量映射
      let waymap = {
        [0]: [0, -1],
        [90]: [1, 0],
        [180]: [0, 1],
        [270]: [-1, 0]
      };
      let ret = vm.move(waymap[vm.direction.mod(360)].map(dim => dim * this.step.value(vm)));
      return callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(ret + ''))));
    }
  }

  //转向节点
  class ASTTurnNode extends ASTNode {
    constructor() {
      super('turn');
    }

    //解析模板tun lef|tun ref x
    parse(stream, vm) {
      super.parse(stream);
      this.way = typeNameParser.findTypeAndCreateIntance('relativedirection', stream, vm);
    }

    exec(vm, callback) {
      //方向-角度映射
      const waymap = {
        'left': -90,
        'right': 90,
        'back': 180
      };
      //确保正确方向转向
      vm.direction += waymap[this.way.value(vm)];
      callback.future(new ExecResult(false, vm.direction));
    }
  }

  //传送节点
  class ASTTranNode extends ASTNode {
    constructor() {
      super('tran');
    }

    //解析模板tran left| tran left 2 | tran ref x 2 | tran ref x ref y
    parse(stream, vm) {
      super.parse(stream);
      this.way = typeNameParser.findTypeAndCreateIntance('absolutedirection', stream, vm);
      try {
        this.step = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
      } catch (err) {
        this.step = {
          value: () => 1
        };
      }
    }

    exec(vm, callback) {
      let waymap = {
        top: [0, -1],
        right: [1, 0],
        bottom: [0, 1],
        left: [-1, 0]
      };
      let ret = vm.move(waymap[this.way.value(vm)].map(dim => dim * this.step.value(vm)));
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(ret ? 1 : 0))));
    }
  }

  //移动节点
  class ASTMoveNode extends ASTNode {
    constructor() {
      super('move');
    }

    //解析模板move bottom| move bottom 5 | move ref x | move bottom ref y | move ref x ref y|move to 5,5|move to ref x
    parse(stream, vm) {
      super.parse(stream);
      try {
        this.way = typeNameParser.findTypeAndCreateIntance('absolutedirection', stream, vm);
        try {
          this.step = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
        } catch (err) {
          this.step = {
            value: () => 1
          };
        }
      } catch (err) {
        let token = stream.readToken();
        if (token === 'to') {
          let pathfinding = vm.pathfinding;
          if (!pathfinding) throw `寻路函数未注册`;
          this.callblock = nodeNameParser.findTypeAndCreateAndDo('call', obj => obj.setNameAndReadParams(pathfinding, stream, vm));
        } else throw err;
      }
    }

    exec(vm, callback) {
      if (this.callblock) {
        this.callblock.exec(vm, callback);
        return;
      }
      //方向-方向向量映射
      let waymap = {
        top: [0, -1],
        right: [1, 0],
        bottom: [0, 1],
        left: [-1, 0]
      };
      //方向-角度映射
      let degmap = {
        'top': 0,
        'right': 90,
        'bottom': 180,
        'left': 270,
      };
      let way = this.way.value(vm);
      let step = this.step.value(vm);
      let ret = vm.move(waymap[way].map(dim => dim * step));
      while (vm.direction.mod(360) != degmap[way]) vm.direction += 90;
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(ret + ''))));
    }
  }

  //建造节点
  class ASTBuildNode extends ASTNode {
    constructor() {
      super('build');
    }

    //无内容节点
    parse() {
      //ignore
    }

    exec(vm, callback) {
      //角度-方向向量映射
      let waymap = {
        [0]: [0, -1],
        [90]: [1, 0],
        [180]: [0, 1],
        [270]: [-1, 0]
      };
      let pos = waymap[vm.direction.mod(360)];
      pos[0] += vm.pos.x;
      pos[1] += vm.pos.y;
      let ret = vm.createWall(pos);
      if (!ret) console.error('这个位置无法设置墙');
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(ret ? '1' : '0'))));
    }
  }

  //粉刷节点
  class ASTBrushNode extends ASTNode {
    constructor() {
      super('brush');
    }

    //解析模板brush 0f0|brush ref x
    parse(stream, vm) {
      super.parse(stream);
      this.color = typeNameParser.findTypeAndCreateIntance('color', stream, vm);
    }

    exec(vm, callback) {
      let waymap = {
        [0]: [0, -1],
        [90]: [1, 0],
        [180]: [0, 1],
        [270]: [-1, 0]
      };
      let pos = waymap[vm.direction.mod(360)];
      pos[0] += vm.pos.x;
      pos[1] += vm.pos.y;
      let ret = vm.brushWall(pos, this.color.value(vm));
      if (!ret) console.error('这个位置无法粉刷墙');
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(ret ? '1' : '0'))));
    }
  }

  //块节点
  class ASTBlockNode extends ASTNode {
    constructor() {
      super('block');
      this.calcNode = true;
    }

    //以block开始至end结束
    parse(stream, vm) {
      super.parse(stream);
      this.list = [];
      let token = stream.readToken();
      while (true) {
        if (stream.isDone() || token == 'end') break;
        let obj = nodeNameParser.findTypeAndCreateIntance(token, stream, vm);
        if (!obj) {
          throw `未知标识符${token}`;
        }
        this.list.push(obj);
        token = stream.readToken();
      }
    }

    exec(vm, callback) {
      let cache = this.list.entries();
      let actor = ret => {
        let node;
        if ((ret && ret.done) || (node = cache.next()).done) {
          vm.varStack.removeLayer();
          vm.callStack.pop();
          return callback.future(ret);
        }
        node.value[1].exec(vm, ret => actor.delay(node.value[1].calcNode ? 0 : vm.delay, ret));
      };
      vm.varStack.addLayer();
      vm.callStack.push(this.line);
      actor();
      //this.list.forEach(node => node.exec(vm));
    }
  }

  //函数节点
  class ASTFuncNode extends ASTNode {
    constructor() {
      super('function');
      this.calcNode = true;
    }

    //FUNC 名字 参数1类型 参数1名字 参数2类型 参数2名字 ... PEND 块节点(以END结束)
    parse(stream, vm) {
      super.parse(stream);
      this.name = stream.readToken();
      if (!this.name) throw '输入流意外终止';
      this.params = {};
      while (true) {
        let token = stream.readToken();
        if (!token) throw '输入流意外终止';
        if (token == 'pend') break;
        let type = typeNameParser.findType(token);
        if (!type) throw `未知类型${token}`;
        let name = stream.readToken();
        if (!name) throw '输入流意外终止';
        this.params[name] = type;
      }
      this.block = new ASTBlockNode();
      this.block.parse(stream, vm);
      vm.funcs[this.name] = this;
    }

    exec(vm, callback) {
      callback.delay(0);
    }
  }

  //定义变量节点
  class ASTDefineNode extends ASTNode {
    constructor() {
      super('define');
      this.calcNode = true;
    }

    //DEFINE 名字 类型 (类型初始化参数)
    parse(stream, vm) {
      super.parse(stream);
      this.name = stream.readToken();
      if (!this.name) throw '输入流意外终止';
      let token = stream.readToken();
      let obj = typeNameParser.findTypeAndCreateIntance(token, stream, vm);
      if (!obj) throw '无法解析内容';
      this.data = obj;
    }

    exec(vm, callback) {
      vm.defs[this.name] = this.data.clone();
      callback.delay(0);
    }
  }

  //消除变量节点
  class ASTUndefineNode extends ASTNode {
    constructor() {
      super('undefine');
      this.calcNode = true;
    }

    //UNDEFINE 名字
    parse(stream) {
      super.parse(stream);
      this.name = stream.readToken();
      if (!this.name) throw '输入流意外终止';
    }

    exec(vm, callback) {
      delete vm.defs[this.name];
      callback.delay(0);
    }
  }

  //调用函数节点
  class ASTCallBlock extends ASTNode {
    constructor() {
      super('call');
      this.calcNode = true;
    }

    //CALL 函数名 参数1 参数2 ...
    parse(stream, vm) {
      this.setNameAndReadParams(stream.readToken(), stream, vm);
    }

    setNameAndReadParams(name, stream, vm) {
      if (!name) throw `参数错误`;
      this.name = name;
      this.func = vm.funcs[this.name];
      if (!this.func) throw `${this.name}函数不存在`;
      this.params = {};
      for (let [key, item] of entries(this.func.params)) {
        try {
          this.params[key] = new item();
          stream.checkPoint();
          this.params[key].parse(stream, vm);
        } catch (err) {
          throw `参数解析错误${err}`;
        }
      }
    }

    exec(vm, callback) {
      vm.varStack.addLayer(this.params.map(item => item.traceRef(vm).clone()));
      this.func.block.exec(vm, ret => {
        vm.varStack.removeLayer();
        callback(ret);
      });
    }
  }

  //抛出异常节点
  class ASTThrowBlock extends ASTNode {
    constructor() {
      super('throw');
      this.calcNode = true;
    }

    //THROW <字符串>
    parse(stream) {
      super.parse(stream);
      this.data = stream.readString();
    }

    exec() {
      throw 'THROW ' + this.data;
    }
  }

  //分支节点
  class ASTIfNode extends ASTNode {
    constructor() {
      super('if');
      this.calcNode = true;
    }

    //IF 判断块(END结束) positive块(END结束) negative块(END结束)
    parse(stream, vm) {
      super.parse(stream);
      this.condition = nodeNameParser.findTypeAndCreateIntance('block', stream, vm);
      this.positive = nodeNameParser.findTypeAndCreateIntance('block', stream, vm);
      this.negative = nodeNameParser.findTypeAndCreateIntance('block', stream, vm);
    }

    exec(vm, callback) {
      this.condition.exec(vm, ret => ret && ret.check(vm) ?
        this.positive.exec(vm, callback) :
        this.negative.exec(vm, callback));
    }
  }

  //循环节点
  class ASTLoopNode extends ASTNode {
    constructor() {
      super('loop');
      this.calcNode = true;
    }

    //LOOP 判断块(END结束) 执行块(END结束)
    parse(stream, vm) {
      super.parse(stream);
      this.condition = nodeNameParser.findTypeAndCreateIntance('block', stream, vm);
      this.body = nodeNameParser.findTypeAndCreateIntance('block', stream, vm);
    }

    exec(vm, callback) {
      let loop = ret => ret && ret.check(vm) ?
        this.body.exec(vm, ret => ret.done ?
          callback.future(ret) :
          this.condition.exec(vm, loop)) :
        callback.future(ret);
      this.condition.exec(vm, loop);
    }
  }

  //返回值节点
  class ASTReturnNode extends ASTNode {
    constructor() {
      super('return');
      this.calcNode = true;
    }

    //RETURN 表达式
    parse(stream, vm) {
      super.parse(stream);
      this.body = nodeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
    }

    exec(vm, callback) {
      this.body.exec(vm, ret => callback.future(new ExecResult(true, ret.data.traceRef(vm).clone())));
    }
  }

  //计算节点
  class ASTCalculateNode extends ASTNode {
    constructor() {
      super('calculate');
      this.calcNode = true;
    }

    //CALC 运算符 操作数1 操作数2 ...
    parse(stream, vm) {
      super.parse(stream);
      let token = stream.readToken();
      this.body = operatorNameParser.findTypeAndCreateIntance(token, stream, vm);
    }

    exec(vm, callback) {
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(this.body.calc(vm).value(vm)))));
    }
  }

  //赋值节点
  class ASTAssignNode extends ASTNode {
    constructor() {
      super('assign');
      this.calcNode = true;
    }

    //ASSIGN 变量名 表达式
    parse(stream, vm) {
      super.parse(stream);
      let token = stream.readToken();
      this.target = token;
      token = stream.readToken();
      this.body = nodeNameParser.findTypeAndCreateIntance(token, stream, vm);
    }

    exec(vm, callback) {
      this.body.exec(vm, rets => {
        //console.log(this.line, this.target, rets.data.value(vm));
        let ret = vm.varStack.findAndSet(this.target, rets.data.clone());
        callback.future(new ExecResult(false, ret));
      });
    }
  }

  //值节点
  class ASTValueNode extends ASTNode {
    constructor() {
      super('value');
      this.calcNode = true;
    }

    //VALUE 类型 类型参数
    parse(stream, vm) {
      super.parse(stream);
      this.body = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
      //console.log(this.line, JSON.stringify(this.body));
    }

    exec(vm, callback) {
      //console.log(this.line, JSON.stringify(this.body), this.body.value(vm));
      callback.future(new ExecResult(false, this.body.traceRef(vm).clone()));
    }
  }

  //坐标分解节点
  class ASTSplitNode extends ASTNode {
    constructor() {
      super('split');
      this.calcNode = true;
    }

    //SPLIT X Y 点
    parse(stream, vm) {
      super.parse(stream);
      this.target = [stream.readToken(), stream.readToken()];
      this.source = typeNameParser.findTypeAndCreateIntance('point', stream, vm);
    }

    exec(vm, callback) {
      let data = this.source.value(vm);
      vm.varStack.findAndSet(this.target[0], typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(data[0])));
      vm.varStack.findAndSet(this.target[1], typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(data[1])));
      callback.future(new ExecResult(false, this.source.traceRef(vm)));
    }
  }

  //坐标合成节点
  class ASTComposeNode extends ASTNode {
    constructor() {
      super('compose');
      this.calcNode = true;
    }

    //COMPOSE 点 X Y
    parse(stream, vm) {
      super.parse(stream);
      this.target = stream.readToken();
      this.source = [
        typeNameParser.findTypeAndCreateIntance('number', stream, vm),
        typeNameParser.findTypeAndCreateIntance('number', stream, vm)
      ];
    }

    exec(vm, callback) {
      let data = typeNameParser.findTypeAndCreateAndDo('point', obj => obj.setValue(this.source.map(ref => ref.value(vm))));
      vm.varStack.findAndSet(this.target, data);
      callback.future(new ExecResult(false, data));
    }
  }

  //数组操作节点
  class ASTArrayNode extends ASTNode {
    constructor() {
      super('array');
      this.calcNode = true;
    }

    parse(stream, vm) {
      super.parse(stream);
      this.array = stream.readToken();
      this.op = stream.readToken();
      switch (this.op) {
        case 'push':
        case 'pushref':
          this.data = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          break;
        case 'pop':
        case 'top':
        case 'empty':
        case 'length':
          break;
        case 'get':
          this.pos = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
          break;
        case 'set':
        case 'setref':
          this.pos = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
          this.data = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          break;
        case 'find':
        case 'foreach':
          this.varname = stream.readToken();
          this.body = nodeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          break;
        case 'remove':
          this.pos = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
          break;
        case 'insert':
        case 'insertref':
          this.pos = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
          this.data = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          break;
        case 'concat':
          this.data = nodeNameParser.findTypeAndCreateIntance('array', stream, vm);
          break;
        default:
          throw `无法解析的操作`;
      }
    }

    exec(vm, callback) {
      let array = vm.varStack.find(this.array).value(vm);
      let ret = null;
      switch (this.op) {
        case 'push':
          array.push(ret = this.data.traceRef(vm).clone());
          break;
        case 'pushref':
          array.push(ret = this.data);
          break;
        case 'pop':
          ret = array.pop();
          break;
        case 'top':
          ret = array[array.length - 1];
          break;
        case 'empty':
          ret = typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(array.length !== 0 ? 1 : 0));
          break;
        case 'length':
          ret = typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(array.length));
          break;
        case 'get':
          ret = array[this.pos.value(vm)];
          break;
        case 'set':
          ret = array[this.pos.value(vm)] = this.data.traceRef(vm).clone();
          break;
        case 'setref':
          ret = array[this.pos.value(vm)] = this.data;
          break;
        case 'find':
          {
            let cache = array.entries();
            let item;
            let loop = res => {
              if ((res && res.check(vm)) || (item = cache.next()).done) {
                vm.varStack.removeLayer();
                return callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(res && res.check(vm) ? res.data.value(vm) : -1))));
              }
              //console.log('Find', this.varname, item.value[1].value(vm));
              vm.defs[this.varname] = item.value[1];
              this.body.exec(vm, loop);
            };
            vm.varStack.addLayer();
            loop();
          }
          break;
        case 'foreach':
          {
            let cache = array.entries();
            let item;
            let loop = () => {
              if ((item = cache.next()).done) {
                vm.varStack.removeLayer();
                return callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(0))));
              }
              vm.defs[this.varname] = item.value[1];
              this.body.exec(vm, loop);
            };
            vm.varStack.addLayer();
            loop();
          }
          break;
        case 'remove':
          {
            let index = this.pos.value(vm);
            if (index != -1)
              array.splice(index, 1);
            ret = typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(array));
          }
          break;
        case 'insert':
          {
            let index = this.pos.value(vm);
            if (index != -1)
              array.splice(index, 0, this.data.traceRef(vm).clone());
            ret = typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(array));
          }
          break;
        case 'insertref':
          {
            let index = this.pos.value(vm);
            if (index != -1)
              array.splice(index, 0, this.data);
            ret = typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(array));
          }
          break;
        case 'concat':
          ret = typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(array.concat(this.data.value(vm))));
          break;
        default:
          throw `意外的参数`;
      }
      if (ret)
        callback.future(new ExecResult(false, ret));
    }
  }

  //当前位置节点
  class ASTCurrentPosition extends ASTNode {
    constructor() {
      super('current position');
      this.calcNode = true;
    }

    parse() {
      //donothing
    }

    exec(vm, callback) {
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('point', obj => obj.setValue([vm.pos.x + 1, vm.pos.y + 1]))));
    }
  }

  //当前朝向节点
  class ASTCurrentFace extends ASTNode {
    constructor() {
      super('current face');
      this.calcNode = true;
    }

    parse() {
      //donothing
    }

    exec(vm, callback) {
      let waymap = {
        [0]: 'top',
        [90]: 'right',
        [180]: 'bottom',
        [270]: 'left'
      };
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('absolutedirection', obj => obj.setValue(waymap[vm.direction.mod(360)]))));
    }
  }

  //强制转向节点
  class ASTFaceTo extends ASTNode {
    constructor() {
      super('face to');
      this.calcNode = true;
    }

    parse(stream, vm) {
      this.target = typeNameParser.findTypeAndCreateIntance('absolutedirection', stream, vm);
    }

    exec(vm, callback) {
      let waymap = {
        [0]: 'top',
        [90]: 'right',
        [180]: 'bottom',
        [270]: 'left'
      };
      let direction = vm.direction;
      let tgt = this.target.value(vm);
      while (waymap[direction.mod(360)] !== tgt) direction += 90;
      if (direction - vm.direction > 180) direction -= 360;
      vm.direction = direction;
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(1))));
    }
  }

  //映射操作节点
  class ASTMapNode extends ASTNode {
    constructor() {
      super('map');
      this.calcNode = true;
    }

    parse(stream, vm) {
      super.parse(stream);
      this.target = stream.readToken();
      this.op = stream.readToken();
      switch (this.op) {
        case 'keys':
        case 'keylength':
          break;
        case 'set':
        case 'setref':
          this.key = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          this.data = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          break;
        case 'get':
        case 'remove':
          this.key = typeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
          break;
        default:
          throw `无法解析的操作`;
      }
    }

    exec(vm, callback) {
      let target = vm.varStack.find(this.target);
      let ret;
      switch (this.op) {
        case 'keys':
          ret = typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(target.keys()));
          break;
        case 'keylength':
          ret = typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(target.keys().length));
          break;
        case 'set':
          ret = target.value(vm)[this.key.value(vm)] = this.data.traceRef(vm).clone();
          break;
        case 'setref':
          ret = target.value(vm)[this.key.value(vm)] = this.data;
          break;
        case 'get':
          ret = target.value(vm)[this.key.value(vm)];
          break;
        case 'remove':
          delete target.value(vm)[this.key.value(vm)];
          ret = typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(0));
          break;
        default:
          throw `意外的参数`;
      }
      if (ret && typeof ret === 'number') ret = typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(ret));
      callback.future(new ExecResult(false, ret || typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(0))));
    }
  }

  //地图信息节点
  class ASTInfoNode extends ASTNode {
    constructor() {
      super('info');
      this.calcNode = true;
    }

    parse(stream) {
      super.parse(stream);
      this.target = stream.readToken();
      switch (this.target) {
        case 'wall':
        case 'w':
        case 'h':
          break;
        default:
          throw '错误的参数';
      }
    }

    exec(vm, callback) {
      if (this.target === 'wall') {
        let data = vm.data;
        let ret = [];
        let func = (pos) => ret.push(typeNameParser.findTypeAndCreateAndDo('point', obj => obj.setValue(pos)));
        for (let i = 0; i < vm.h; i++)
          for (let j = 0; j < vm.w; j++)
            if (data[i][j]) func([j + 1, i + 1]);
        callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(ret))));
      } else if (this.target === 'w') {
        callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(vm.w))));
      } else if (this.target === 'h') {
        callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(vm.h))));
      } else {
        throw '意外参数';
      }
    }
  }

  //有效位置测试节点
  class ASTTestForNode extends ASTNode {
    constructor() {
      super('testfor');
      this.calcNode = true;
    }

    parse(stream, vm) {
      super.parse(stream);
      this.target = typeNameParser.findTypeAndCreateIntance('point', stream, vm);
    }

    exec(vm, callback) {
      let value;
      let pos = this.target.value(vm);
      pos[0]--;
      pos[1]--;
      value = vm.checkPos(pos);
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(value ? 1 : 0))));
    }
  }

  //获取周边的有效位置节点（为了效率）
  class ASTGetNeighbors extends ASTNode {
    constructor() {
      super('getneighbors');
      this.calcNode = true;
    }

    parse(stream, vm) {
      super.parse(stream);
      this.target = typeNameParser.findTypeAndCreateIntance('point', stream, vm);
      this.open = typeNameParser.findTypeAndCreateIntance('array', stream, vm);
      this.close = typeNameParser.findTypeAndCreateIntance('array', stream, vm);
    }

    exec(vm, callback) {
      let target = this.target.value(vm);
      let open = this.open.value(vm);
      let close = this.close.value(vm);
      let retarr = [];
      target = target.map(i => i - 1);

      let arrayequal = (a, b) => {
        return a[0] === b[0] + 1 && a[1] === b[1] + 1;
      };

      let checkNotInArr = (arr, temp) => {
        return !arr.some(i => arrayequal(i.value(vm)[0].value(vm), temp));
      };

      let temp = [target[0] - 1, target[1]];
      if (vm.checkPos(temp) && checkNotInArr(open, temp) && checkNotInArr(close, temp)) retarr.push(typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(temp.map(i => i + 1))));

      temp = [target[0] + 1, target[1]];
      if (vm.checkPos(temp) && checkNotInArr(open, temp) && checkNotInArr(close, temp)) retarr.push(typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(temp.map(i => i + 1))));

      temp = [target[0], target[1] - 1];
      if (vm.checkPos(temp) && checkNotInArr(open, temp) && checkNotInArr(close, temp)) retarr.push(typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(temp.map(i => i + 1))));

      temp = [target[0], target[1] + 1];
      if (vm.checkPos(temp) && checkNotInArr(open, temp) && checkNotInArr(close, temp)) retarr.push(typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(temp.map(i => i + 1))));

      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('array', obj => obj.setValue(retarr))));
    }
  }

  //寻路算法绑定节点
  class ASTBindPathFinding extends ASTNode {
    constructor() {
      super('bind path finding');
      this.calcNode = true;
    }

    //BINDPATHFINDING 寻路函数
    parse(stream, vm) {
      vm.pathfinding = stream.readToken();
    }

    exec(vm, callback) {
      callback.future(new ExecResult(false, typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(1))));
    }
  }

  //调试节点
  class ASTDebugNode extends ASTNode {
    constructor() {
      super('debug');
      this.calcNode = true;
    }

    //DEBUG 表达式
    parse(stream, vm) {
      super.parse(stream);
      this.line = stream.line;
      this.data = nodeNameParser.findTypeAndCreateIntance(stream.readToken(), stream, vm);
    }

    exec(vm, callback) {
      console.log('DEBUG BEGIN', this.line);
      this.data.exec(vm, ret => {
        try {
          console.log('DEBUG END', this.line, ret && ret.data && JSON.stringify(ret.data.value(vm)));
        } catch (e) {
          console.log('DEBUG END', this.line, ret && ret.data && ret.data.value(vm));
        }
        callback.future(ret);
      });
    }
  }

  class AST {
    constructor(root) {
      this.root = root;
    }
    exec(vm, callback) {
      this.root.exec(vm, callback);
    }
  }

  class SObj {
    constructor(typename) {
      this.type = typename;
    }
    readRef(stream) {
      let token = stream.readToken();
      if (token == 'ref') {
        this.ref = stream.readToken();
        if (!this.ref) {
          throw '无法解析引用';
        }
      } else throw '无法解析值或引用';
      return;
    }
    isRef() {
      return typeof this.ref !== 'undefined';
    }
    traceRef(vm) {
      return this.isRef() ? vm.varStack.find(this.ref).traceRef(vm) : this;
    }
    setValue(value) {
      this.svalue = value;
    }
    parse() {
      throw 'Not implemented.';
    }
    value() {
      throw 'Not implemented.';
    }
    clone() {
      let ret = Object.assign({}, this);
      /* jshint -W103 */
      ret.__proto__ = this.__proto__;
      if (this.svalue && typeof this.svalue === 'object') {
        if (this.svalue instanceof Array) {
          ret.svalue = this.svalue.slice(0);
        } else {
          ret.svalue = Object.assign({}, this.svalue);
          ret.svalue.__proto__ = this.svalue.__proto__;
        }
      }
      /* jshint +W103 */
      return ret;
    }
  }

  class SNumber extends SObj {
    constructor() {
      super('number');
    }
    parse(stream) {
      this.svalue = stream.readNumber();
      if (typeof this.svalue == 'number') return;
      stream.cancelLast();
      stream.checkPoint();
      super.readRef(stream);
    }
    value(vm) {
      return typeof this.svalue == 'number' ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SPoint extends SObj {
    constructor() {
      super('point');
    }
    parse(stream) {
      this.svalue = stream.readPoint();
      if (this.svalue instanceof Array) return;
      stream.cancelLast();
      stream.checkPoint();
      super.readRef(stream);
    }
    value(vm) {
      return this.svalue instanceof Array ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SADirection extends SObj {
    constructor() {
      super('absolute direction');
    }
    parse(stream) {
      try {
        this.svalue = stream.readAbsoluteDirection();
      } catch (err) {
        stream.cancelLast();
        stream.checkPoint();
        super.readRef(stream);
      }
    }
    value(vm) {
      return typeof this.svalue == 'string' ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SRDirection extends SObj {
    constructor() {
      super('relative direction');
    }
    parse(stream) {
      try {
        this.svalue = stream.readRelativeDirection();
      } catch (err) {
        stream.cancelLast();
        stream.checkPoint();
        super.readRef(stream);
      }
      return;
    }
    value(vm) {
      return typeof this.svalue == 'string' ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SColor extends SObj {
    constructor() {
      super('color');
    }
    parse(stream) {
      this.svalue = stream.readColor();
      if (!this.svalue) {
        stream.cancelLast();
        stream.checkPoint();
        super.readRef(stream);
      }
    }
    value(vm) {
      return typeof this.svalue == 'string' ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SArray extends SObj {
    constructor() {
      super('array');
    }

    parse(stream) {
      let token = stream.readToken();
      if (token === 'empty')
        this.svalue = new Array(length);
      else {
        stream.cancelLast();
        stream.checkPoint();
        super.readRef(stream);
      }
    }

    value(vm) {
      return this.svalue instanceof Array ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SMap extends SObj {
    constructor() {
      super('map');
    }

    parse(stream) {
      let token = stream.readToken();
      if (token === 'empty')
        this.svalue = {};
      else {
        stream.cancelLast();
        stream.checkPoint();
        super.readRef(stream);
      }
    }

    value(vm) {
      return typeof this.svalue === 'object' ? this.svalue : vm.varStack.find(this.ref).value(vm);
    }
  }

  class SAny extends SObj {
    constructor() {
      super('any');
    }

    parse(stream) {
      super.readRef(stream);
    }

    value(vm) {
      return vm.varStack.find(this.ref).value(vm);
    }
  }

  class Operator {
    constructor(name) {
      this.name = name;
    }

    parse() {
      throw 'Not implemented.';
    }

    calc() {
      throw 'Not implemented.';
    }
  }

  function OperatorMaker1(name, func) {
    return class op extends Operator {
      constructor() {
        super(name);
      }
      parse(stream, vm) {
        this.value = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
      }
      calc(vm) {
        return typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(func(this.value.value(vm))));
      }
    };
  }

  function OperatorMaker2(name, func) {
    return class op extends Operator {
      constructor() {
        super(name);
      }
      parse(stream, vm) {
        this.a = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
        this.b = typeNameParser.findTypeAndCreateIntance('number', stream, vm);
      }
      calc(vm) {
        return typeNameParser.findTypeAndCreateAndDo('number', obj => obj.setValue(func(this.a.value(vm), this.b.value(vm))));
      }
    };
  }

  //节点名字注册
  nodeNameParser.push(new NameRegister(ASTGoNode, ['go']));
  nodeNameParser.push(new NameRegister(ASTTurnNode, ['turn', 'tun']));
  nodeNameParser.push(new NameRegister(ASTTranNode, ['tran', 'tra']));
  nodeNameParser.push(new NameRegister(ASTMoveNode, ['move', 'mov']));
  nodeNameParser.push(new NameRegister(ASTBuildNode, ['build']));
  nodeNameParser.push(new NameRegister(ASTBrushNode, ['brush', 'bru']));
  nodeNameParser.push(new NameRegister(ASTDefineNode, ['define', 'def']));
  nodeNameParser.push(new NameRegister(ASTUndefineNode, ['undefine', 'undef']));
  nodeNameParser.push(new NameRegister(ASTFuncNode, ['function', 'func']));
  nodeNameParser.push(new NameRegister(ASTCallBlock, ['call']));
  nodeNameParser.push(new NameRegister(ASTThrowBlock, ['throw']));
  nodeNameParser.push(new NameRegister(ASTBlockNode, ['block']));
  nodeNameParser.push(new NameRegister(ASTIfNode, ['if']));
  nodeNameParser.push(new NameRegister(ASTLoopNode, ['loop']));
  nodeNameParser.push(new NameRegister(ASTReturnNode, ['return', 'ret']));
  nodeNameParser.push(new NameRegister(ASTCalculateNode, ['calculate', 'calc']));
  nodeNameParser.push(new NameRegister(ASTAssignNode, ['assign', 'set']));
  nodeNameParser.push(new NameRegister(ASTValueNode, ['value', 'val']));
  nodeNameParser.push(new NameRegister(ASTSplitNode, ['split']));
  nodeNameParser.push(new NameRegister(ASTComposeNode, ['compose']));
  nodeNameParser.push(new NameRegister(ASTArrayNode, ['array']));
  nodeNameParser.push(new NameRegister(ASTCurrentPosition, ['currentposition', 'curpos']));
  nodeNameParser.push(new NameRegister(ASTCurrentFace, ['currentface', 'face']));
  nodeNameParser.push(new NameRegister(ASTFaceTo, ['faceto']));
  nodeNameParser.push(new NameRegister(ASTMapNode, ['map']));
  nodeNameParser.push(new NameRegister(ASTInfoNode, ['info']));
  nodeNameParser.push(new NameRegister(ASTTestForNode, ['testfor']));
  nodeNameParser.push(new NameRegister(ASTGetNeighbors, ['getneighbors']));
  nodeNameParser.push(new NameRegister(ASTBindPathFinding, ['bindpathfinding']));
  nodeNameParser.push(new NameRegister(ASTDebugNode, ['debug']));

  typeNameParser.push(new NameRegister(SNumber, ['number', 'num']));
  typeNameParser.push(new NameRegister(SPoint, ['point', 'pt']));
  typeNameParser.push(new NameRegister(SADirection, ['absolutedirection', 'adirect']));
  typeNameParser.push(new NameRegister(SRDirection, ['relativedirection', 'rdirect']));
  typeNameParser.push(new NameRegister(SColor, ['color']));
  typeNameParser.push(new NameRegister(SArray, ['array']));
  typeNameParser.push(new NameRegister(SMap, ['map']));
  typeNameParser.push(new NameRegister(SAny, ['any']));

  //运算符注册
  operatorNameParser.push(new NameRegister(OperatorMaker1('Negative', v => -v), ['negative', 'neg']));
  operatorNameParser.push(new NameRegister(OperatorMaker1('Positive', v => v), ['positive', 'pos']));
  operatorNameParser.push(new NameRegister(OperatorMaker1('Increment', v => v + 1), ['increment', 'inc']));
  operatorNameParser.push(new NameRegister(OperatorMaker1('Decrement', v => v - 1), ['decrement', 'dec']));
  operatorNameParser.push(new NameRegister(OperatorMaker1('Absolute', v => Math.abs(v)), ['absolute', 'abs']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Add', (a, b) => a + b), ['add']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Subtract', (a, b) => a - b), ['subtract', 'sub']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Multiply', (a, b) => a * b), ['multiply', 'mul']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Divide', (a, b) => a / b), ['divide', 'div']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Modulus', (a, b) => a % b), ['modulus', 'mod']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Equal', (a, b) => a === b ? 1 : 0), ['equal', 'equ']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Inequal', (a, b) => a !== b ? 1 : 0), ['inequal', 'ine']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Greater', (a, b) => a > b ? 1 : 0), ['greater', 'gre']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Less', (a, b) => a < b ? 1 : 0), ['less', 'les']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Greater Equal', (a, b) => a >= b ? 1 : 0), ['greaterequal', 'gree']));
  operatorNameParser.push(new NameRegister(OperatorMaker2('Less Equal', (a, b) => a <= b ? 1 : 0), ['lessequal', 'lese']));

  let command, linenums;
  let rootVm;

  function parseAST(stream) {
    let rootnode = new ASTBlockNode();
    rootnode.parse(stream, rootVm);
    return new AST(rootnode);
  }

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
      let ast = parseAST(stream);
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
    for (let i = 0; i < command.value.length; i++)
      if (command.value[i] == '\n') line++;
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
})(window, document);