// Store is needed to export declarations, but unused as far as
// tslint is concerned.
// https://github.com/Microsoft/TypeScript/issues/6307#issuecomment-168321011
/* tslint:disable:no-unused-variable */
import {StoreEnhancer, StoreCreator, Reducer, Store, Action} from 'redux';
/* tslint:enable:no-unused-variable */

export type StateWithTasks<State,Task> = [State, Task | Task[]];

const hasTasks = <S,T>(r: EnhancedReducerResult<S,T>): r is StateWithTasks<S,T> => r instanceof Array;

export type EnhancedReducerResult<State,Task> = State | StateWithTasks<State,Task>;
export type EnhancedReducer<State, Task> = <Msg>(state: State, msg: Msg) => EnhancedReducerResult<State,Task>;

type EnhancedReducersMapObject<Task> = {
    [key: string]: EnhancedReducer<any, Task>;
}

type TaskCallback<T> = (task: T) => any

const ensureArray = <T>(x: T | T[]) => x instanceof Array ? x : [x];

export const getState = <S,T>(r: EnhancedReducerResult<S,T>) => hasTasks(r) ? r[0] : r;
export const getTasks = <S,T>(r: EnhancedReducerResult<S,T>) => hasTasks(r) ? ensureArray(r[1]) : [];


const liftReducer = <Msg, S, Task>(reducer: EnhancedReducer<S, Task>, callback: TaskCallback<Task>): Reducer<S> => {
    return (state: S, msg: Msg) => {
        const result = reducer(state, msg);
        if(!result) {
            console.error("undefined returned from reducer", reducer);
            throw Error(`undefined returned from reducer!`);
        }

        getTasks(result).forEach((t) => callback(t));
        return getState(result);
    }
}

export interface Observable<T> {
    subscribe(fn?: (a: T) => void, error?: (error: any) => void, complete?: () => void): any;
}

export interface Subject<T> extends Observable<T> {
    next(t: T): void;
    flatMap<R>(project: (value: T, index: number) => Observable<R>): Observable<R>;
}

export type TaskRunner<Task, Msg> = (task$: Observable<Task>) => Observable<Msg>;

export interface EnhanceOptions<Task, Msg> {
    createSubject(): Subject<Task>
    taskRunner: TaskRunner<Task, Msg>,
};

const enhance = <Task, Msg extends Action>(options: EnhanceOptions<Task, Msg>) => (originalCreateStore: StoreCreator) => {
    const { createSubject, taskRunner } = options;
    return <S>(reducer: EnhancedReducer<S, Task>, initialState: S, enhancer?: StoreEnhancer<S>) => {

        // This subject represents a stream of cmds coming from
        // the reducer
        const subject = createSubject();
        const liftedReducer = liftReducer(reducer, task => subject.next(task));

        const store = originalCreateStore(liftedReducer, initialState, enhancer)

        // Close the loop by running the command and dispatching to the
        // store
        taskRunner(subject).subscribe(store.dispatch);

        return store;
    }
}

export default enhance;

type Accumulator<S,Task> = {
    state: S,
    tasks: Task[],
};


type Dictionary<T> = { [index: string]: T; }
export const combineReducers = <S, Task>(reducerMap: EnhancedReducersMapObject<Task>): EnhancedReducer<S, Task> => {
    return <Msg>(state: Dictionary<any>, msg: Msg): [S, Task[]] => {
        const model = Object.keys(reducerMap).reduce<Accumulator<any,Task>>((acc, key) => {
            const reducer = reducerMap[key];

            // We lose type safety here because state is a record
            const previousStateForKey = state[key];
            const result = <EnhancedReducerResult<S,Task>>reducer(previousStateForKey, msg);
            acc.state[key] = getState(result);
            acc.tasks.push(...getTasks(result));

            return acc;
        }, {
            state: {},
            tasks: [],
        });

        return [model.state, model.tasks];
    };
}

export const composeReducers = <S, Task>(...reducers: EnhancedReducer<S, Task>[]): EnhancedReducer<S, Task> => {
    return <Msg>(state: S, msg: Msg): EnhancedReducerResult<S, Task> => {
        const model = reducers.reduce<Accumulator<S,Task>>((acc, reducer) => {
            const result = reducer(acc.state, msg);

            acc.state = getState(result);
            acc.tasks.push(...getTasks(result));

            return acc;
        }, {
            state: state,
            tasks: [],
        });

        return [model.state, model.tasks];
    };
}

