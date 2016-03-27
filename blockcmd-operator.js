(function(global) {
  "use strict";

  const Operator = global.Operator;
  const typeNameParser = global.typeNameParser;
  const operatorNameParser = global.operatorNameParser;
  const NameRegister = global.NameRegister;

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
})(window);