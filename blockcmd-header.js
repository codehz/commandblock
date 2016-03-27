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
  global.entries = function* entries(obj) {
    for (let key of Object.keys(obj)) {
      yield [key, obj[key]];
    }
  };
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
  global.StringStream = class StringStream {
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
  };

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
  global.VM = class VM {
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
        x: pos[0],
        y: pos[1]
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

    switchWall(pos) {
      if (pos[0] >= 0 && pos[0] < this.w && pos[1] >= 0 && pos[1] < this.h) {
        if (!this.data[pos[1]][pos[0]]) this.data[pos[1]][pos[0]] = 'aaa';
        else this.data[pos[1]][pos[0]] = null;
        this.updateWall();
        return true;
      }
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
          } else {
            let target = document.getElementById(`box-${i}-${j}`);
            target.style.background = `none`;
          }
        }
      }
    }
  };

  //抽象语法树节点
  global.ASTNode = class ASTNode {
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
  };

  global.SObj = class SObj {
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
  };

  global.Operator = class Operator {
    constructor(name) {
      this.name = name;
    }

    parse() {
      throw 'Not implemented.';
    }

    calc() {
      throw 'Not implemented.';
    }
  };

  //名字注册器
  global.NameRegister = class NameRegister {
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
  };

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
  global.nodeNameParser = new NameParser();
  //类型名字解析器
  global.typeNameParser = new NameParser();
  //运算符名字解析器
  global.operatorNameParser = new NameParser();
  //执行结果
  global.ExecResult = class ExecResult {
    constructor(done, data) {
      this.done = done;
      this.data = data;
    }

    //检查结果
    check(vm) {
      return this.data && this.data.type == 'number' && this.data.value(vm) !== 0;
    }
  };

  class AST {
    constructor(root) {
      this.root = root;
    }
    exec(vm, callback) {
      this.root.exec(vm, callback);
    }
  }

  global.parseAST = function parseAST(stream, vm) {
    return new AST(global.nodeNameParser.findTypeAndCreateIntance('block', stream, vm));
  };
})(window);