'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */


var DebuggerHandler = require('../lib/DebuggerHandler');

describe('debugger-hhvm-proxy DebuggerHandler', () => {
    var callback;
    var socket;
    var handler;

    beforeEach(() => {
      callback = jasmine.createSpyObj('callback', ['replyToCommand', 'replyWithError', 'sendMethod']);
      socket = jasmine.createSpyObj('socket', ['getStatus', 'getStackFrames', 'sendContinuationCommand', 'sendBreakCommand']);
      handler = new DebuggerHandler(callback, socket);
    });

    it('enable', () => {
      waitsForPromise(async () => {
        socket.getStatus = jasmine.createSpy('getStatus').andReturn(Promise.resolve('starting'));
        socket.sendContinuationCommand = jasmine.createSpy('sendContinuationCommand')
          .andReturn(Promise.resolve('break'));
        socket.getStackFrames = jasmine.createSpy('getStackFrames').andReturn(Promise.resolve(
          {
            stack: [
              {
                $: {
                  where: 'foo',
                  level: '0',
                  type: 'file',
                  filename: 'file:///usr/test.php',
                  lineno: '5',
                },
              },
              {
                $: {
                  where: 'main',
                  level: '1',
                  type: 'file',
                  filename: 'file:///usr/test.php',
                  lineno: '15',
                },
              },
            ]
          }));

        await handler.handleMethod(1, 'enable');

        expect(socket.getStatus).toHaveBeenCalledWith();
        expect(socket.sendContinuationCommand).toHaveBeenCalledWith('step_into');
        expect(callback.sendMethod).toHaveBeenCalledWith('Debugger.resumed', undefined);
        expect(socket.getStackFrames).toHaveBeenCalledWith();
        expect(callback.sendMethod).toHaveBeenCalledWith(
          'Debugger.paused',
          {
            callFrames: [
              {
                  callFrameId: 0,
                  functionName: 'foo',
                  location: {
                    lineNumber: 4,
                    scriptId: '/usr/test.php',
                  },
                  scopeChain: [
                    {
                      type: 'local',
                      object: {
                        value: 'TODO: scopeOfFrame',
                      },
                    }],
                  'this': { value: 'TODO: this-object'},
              },
              {
                  callFrameId: 1,
                  functionName: 'main',
                  location: {
                    lineNumber: 14,
                    scriptId: '/usr/test.php',
                  },
                  scopeChain: [
                    {
                      type: 'local',
                      object: {
                        value: 'TODO: scopeOfFrame',
                      },
                    }],
                  'this': { value: 'TODO: this-object'},
              },
            ],
            reason: 'breakpoint',
            data: {},
          });
      });
    });

    it('pause - success', () => {
      socket.sendBreakCommand = jasmine.createSpy('sendBreakCommand').andReturn(Promise.resolve(true));
      handler.handleMethod(1, 'pause');
      expect(socket.sendBreakCommand).toHaveBeenCalledWith();
    });

    it('pause - failure', () => {
      waitsForPromise(async () => {
        socket.sendBreakCommand = jasmine.createSpy('sendBreakCommand').andReturn(Promise.resolve(false));

        await handler.handleMethod(1, 'pause');

        expect(socket.sendBreakCommand).toHaveBeenCalledWith();
        expect(callback.replyWithError).toHaveBeenCalledWith(1, jasmine.any(String));
      });
    });

    function testContinuationCommand(chromeCommand, dbgpCommand) {
      return async () => {
        socket.sendContinuationCommand = jasmine.createSpy('sendContinuationCommand')
          .andReturn(Promise.resolve('break'));
        socket.getStackFrames = jasmine.createSpy('getStackFrames').andReturn(Promise.resolve({stack: []}));

        await handler.handleMethod(1, chromeCommand);

        expect(socket.sendContinuationCommand).toHaveBeenCalledWith(dbgpCommand);
        expect(callback.sendMethod).toHaveBeenCalledWith('Debugger.resumed', undefined);
        expect(socket.getStackFrames).toHaveBeenCalledWith();
        expect(callback.sendMethod).toHaveBeenCalledWith(
          'Debugger.paused',
          {
            callFrames: [],
            reason: 'breakpoint',
            data: {},
          });
      };
    }

    it('stepInto', () => {
      waitsForPromise(testContinuationCommand('stepInto', 'step_into'));
    });

    it('stepOut', () => {
      waitsForPromise(testContinuationCommand('stepOut', 'step_out'));
    });

    it('stepOver', () => {
      waitsForPromise(testContinuationCommand('stepOver', 'step_over'));
    });

    it('resume', () => {
      waitsForPromise(testContinuationCommand('resume', 'run'));
    });

    it('stopping', () => {
      waitsForPromise(async () => {
        var status = 'stopping';
        socket.sendContinuationCommand = jasmine.createSpy('sendContinuationCommand')
          .andCallFake(async () => {
            if (status === 'stopping') {
              status = 'stopped';
              return 'stopping';
            } else {
              return status;
            }
          });
        var onSessionEnd = jasmine.createSpy('onSessionEnd');
        handler.onSessionEnd(onSessionEnd);

        await handler.handleMethod(1, 'resume');

        expect(socket.sendContinuationCommand).toHaveBeenCalledWith('run');
        expect(callback.sendMethod).toHaveBeenCalledWith('Debugger.resumed', undefined);
        expect(socket.sendContinuationCommand).toHaveBeenCalledWith('stop');
        expect(callback.sendMethod).toHaveBeenCalledWith('Debugger.resumed', undefined);
        expect(callback.sendMethod).toHaveBeenCalledWith(
          'Debugger.paused',
          {
            callFrames: [],
            reason: 'breakpoint',
            data: {},
          });
        expect(onSessionEnd).toHaveBeenCalledWith();
      });
    });

    it('setPauseOnExceptions', () => {
      handler.handleMethod(1, 'setPauseOnExceptions');

      expect(callback.replyWithError).toHaveBeenCalledWith(1, jasmine.any(String));
    });

    it('setAsyncCallStackDepth', () => {
      handler.handleMethod(1, 'setAsyncCallStackDepth');

      expect(callback.replyWithError).toHaveBeenCalledWith(1, jasmine.any(String));
    });

    it('skipStackFrames', () => {
      handler.handleMethod(1, 'skipStackFrames');

      expect(callback.replyWithError).toHaveBeenCalledWith(1, jasmine.any(String));
    });

    it('unknown', () => {
      handler.handleMethod(4, 'unknown');
      expect(callback.replyWithError).toHaveBeenCalledWith(4, jasmine.any(String));
    });
});
