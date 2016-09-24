import enhance, { composeReducers, EnhancedReducerResult, getState, getTasks } from "./redux-reducer-effects";
import { assert } from "chai";
import { createStore } from "redux";
import { Subject, Observable, Scheduler } from "@reactivex/rxjs";

const create = <T>(t: T): T => t;

type IncrementAction = { type: 'increment' };
type AsyncIncrementAction = { type: 'asyncInc' };
type Action = IncrementAction | AsyncIncrementAction;
type AsyncIncrementTask = { task: 'asyncInc' };
type StubTask = { task: 'do thing' };
type Task = AsyncIncrementTask | StubTask;
type State = {
    counter: number,
};

describe("redux-reducer-effects", function() {

    describe("enhance store", function() {

        it("can create", function() {


            const enhancerStack = enhance({
                createSubject: () => new Subject<Task>(),
                taskRunner,
            });

            const enhancedCreateStore = enhancerStack(createStore);
            const store = enhancedCreateStore(reducer, { counter: 0 }, enhancerStack);

            store.dispatch({ type: "asyncInc" });

            return wait(5)
                .then(() => {
                    assert.deepEqual(store.getState(), { counter: 1 });
                })

            function reducer(state: State, action: Action): EnhancedReducerResult<State,Task> {
                switch(action.type) {
                    case "asyncInc":
                        return [state, { task: "asyncInc" }];

                    case "increment":
                        return { counter: state.counter + 1 };

                    default:
                        return state;
                }
            }

            function taskRunner(task$: Observable<Task>): Observable<Action> {
                return task$
                    .map(() => (create<IncrementAction>({ type: "increment" })))
                    .observeOn(Scheduler.async)
            }


        })

    })

    describe("compose reducers", function() {

        it("keeps all state changes", function() {
            const combined = composeReducers(increment, increment, increment);

            const result = combined({ counter: 0 }, { type: "init" });
            const state = getState(result);
            assert(state, "expected final state");
            assert.equal(state.counter, 3);

            function increment(s: State, action: Action) {
                return {
                    counter: s.counter + 1,
                }
            }
        })

        it("combines tasks, from both states with and without new tasks", function() {
            const combined = composeReducers(increment, incrementWithTask, increment, incrementWithTask);
            const stubTask = () => create<StubTask>({ task: "do thing" });

            const result = combined({ counter: 0 }, { type: "init" });
            const state = getState(result);
            const tasks = getTasks(result);

            assert(state, "expected final state");
            assert.equal(state.counter, 4);
            assert.deepEqual(tasks, [stubTask(), stubTask()]);

            function increment(s: State, action: Action) {
                return {
                    counter: s.counter + 1,
                }
            }

            function incrementWithTask(s: State, action: Action): EnhancedReducerResult<State, Task> {
                return [{
                    counter: s.counter + 1,
                }, stubTask()]
            }
        })


    })

    describe("combine reducers", function() {


    })
})


function wait(n: number) {
    return new Promise(resolve => setTimeout(resolve, n));
}
