(function(global) {
  "use strict";

  const SObj = global.SObj;
  const typeNameParser = global.typeNameParser;
  const NameRegister = global.NameRegister;

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

  typeNameParser.push(new NameRegister(SNumber, ['number', 'num']));
  typeNameParser.push(new NameRegister(SPoint, ['point', 'pt']));
  typeNameParser.push(new NameRegister(SADirection, ['absolutedirection', 'adirect']));
  typeNameParser.push(new NameRegister(SRDirection, ['relativedirection', 'rdirect']));
  typeNameParser.push(new NameRegister(SColor, ['color']));
  typeNameParser.push(new NameRegister(SArray, ['array']));
  typeNameParser.push(new NameRegister(SMap, ['map']));
  typeNameParser.push(new NameRegister(SAny, ['any']));
})(window);