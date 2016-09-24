import enhance, {combineReducers, TaskRunner} from './redux-reducer-effects';
import {createStore} from 'redux';
import { Subject, Observable } from "@reactivex/rxjs";

// Helpers
const create = <T>(t: T): T => t;
export type Success<A> = { success: true; value: A; }
export type Failure<X> = { success: false; value: X }
export type Result<X, A> = Failure<X> | Success<A>;
export const createFailure = <X>(x: X): Failure<X> => ({ success: false, value: x })
export const createSuccess = <A>(a: A): Success<A> => ({ success: true, value: a })

// Actions
enum ActionTypes { Fetch, FetchSuccess, FetchError };
type FetchAction = { type: ActionTypes.Fetch };
const createFetchAction = (): FetchAction => ({ type: ActionTypes.Fetch })
type FetchSuccessAction = { type: ActionTypes.FetchSuccess, result: Success<string> };
const createFetchSuccessAction = (result: Success<string>): FetchSuccessAction => ({
    type: ActionTypes.FetchSuccess,
    result
});
type FetchErrorAction = { type: ActionTypes.FetchError, result: Failure<string> };
const createFetchErrorAction = (result: Failure<string>): FetchErrorAction => ({
    type: ActionTypes.FetchError,
    result
});
type Action = FetchAction | FetchSuccessAction | FetchErrorAction;

// Tasks
type GetRandomGifTask = {
    type: 'GetRandomGif',
    topic: string,
    onFail: (x: Failure<string>) => FetchErrorAction,
    onSuccess: (a: Success<string>) => FetchSuccessAction,
}
type Task = GetRandomGifTask;

type MainState = {
    status: 'not started' | 'pending' | 'success' | 'error',
    result?: Result<string, string>
}
type State = {
    main: MainState
};
const patch = <O, P>(o: O, p: P): O & P => Object.assign({}, o, p);
const reducer = (state: MainState, action: Action): [MainState, Task[]] => {
    switch (action.type) {
        case ActionTypes.Fetch:
            return [patch(state, { status: 'pending', result: undefined }), [
                create<GetRandomGifTask>({
                    type: 'GetRandomGif',
                    topic: 'food',
                    onFail: createFetchErrorAction,
                    onSuccess: createFetchSuccessAction,
                })
            ]];
        case ActionTypes.FetchSuccess:
            return [patch(state, { status: 'success', result: action.result }), []]
        case ActionTypes.FetchError:
            return [patch(state, { status: 'error', result: action.result }), []]
        default:
            return [state, []];
    }
}

const initialState: State = {
    main: {
        status: 'not started'
    }
};

const createGifUrl = (topic: string): string => `https://api.giphy.com/v1/gifs/random?api_key=dc6zaTOxFJmzC&tag=${topic}`;
const decodeGifUrl = (response: any): string => response.data.image_url;
// Callbacks must be on Task because otherwise we don't know their type
// Is result of Task compaitable with callback? We only know this if
// they are coupled
const myTaskRunner: TaskRunner<Task, Action> = <X, A>(tasks$: Observable<Task>): Observable<Action> => {
    return tasks$
        .filter(task => task.type === 'GetRandomGif')
        .switchMap(task => {
            const url = createGifUrl(task.topic);
            return Observable.ajax({ url, crossDomain: true })
                .map(decodeGifUrl)
                .map(createSuccess)
                .catch(error => Observable.of(createFailure(error)))
                .map(result => (
                    result.success
                        ? task.onSuccess(result)
                        : task.onFail(result)
                ))
        })
};

const enhancerStack = enhance({
    createSubject: () => new Subject<Task>(),
    taskRunner: myTaskRunner,
});

const enhancedCreateStore = enhancerStack(createStore);
const store = enhancedCreateStore(combineReducers<State, Task>({ main: reducer }), initialState);

const rootEl = document.getElementById('root');
store.subscribe(() => {
    const state = store.getState();
    if (rootEl) rootEl.innerHTML = `
<pre>
Status: ${state.main.status}
Result success: ${state.main.result !== undefined && state.main.result.success === true ? true : false}
Result success value/failure reason: ${state.main.result !== undefined
    ? state.main.result.success === true
        ? JSON.stringify(state.main.result.value, null, '\t')
        : state.main.result
    : ''}
</pre>`;
});

store.dispatch(createFetchAction());
