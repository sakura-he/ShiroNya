import type { HttpResponse } from "./index";

interface WorkplaceIndexData {
    [key: string]: unknown;
    user: {
        nick_name: string;
        work: {
            underway: number;
            done: number;
            undone: number;
            total: number;
        };
    };
    slide: unknown[];
    shortcut: unknown[];
    timeline: Array<{
        time: string;
        user_name: string;
        create_time: string;
        action: number;
        team: string;
        project_name: string;
        team_id: number;
        project_id: number;
        user_id: number;
    }>;
}

interface WorkplaceMemberData {
    [key: string]: unknown;
    page_total: number;
    page_current: number;
    page_num: number;
    members: Array<{
        user: string;
        status: number;
        work: Array<{
            date: string;
            new_work: number;
            done: number;
            undone: number;
        }>;
        today_work: {
            done: number;
            undone: number;
            underway: number;
        };
    }>;
}

function localResponse<T>(data: T): Promise<HttpResponse<T>> {
    return Promise.resolve({
        status: 200,
        msg: "success",
        code: 200,
        data,
    });
}

const workplaceIndexData: WorkplaceIndexData = {
    user: {
        nick_name: "admin",
        work: {
            underway: 10,
            done: 34,
            undone: 26,
            total: 70,
        },
    },
    slide: [],
    shortcut: [],
    timeline: [
        {
            time: "05-01",
            user_name: "admin",
            create_time: "05-01",
            action: 1,
            team: "平台组",
            project_name: "权限中心",
            team_id: 1,
            project_id: 3,
            user_id: 1221,
        },
        {
            time: "05-02",
            user_name: "admin",
            create_time: "05-02",
            action: 2,
            team: "运营组",
            project_name: "菜单治理",
            team_id: 2,
            project_id: 4,
            user_id: 1221,
        },
    ],
};

const workplaceMemberData: WorkplaceMemberData = {
    page_total: 8,
    page_current: 1,
    page_num: 8,
    members: [
        {
            user: "李明",
            status: 1,
            work: [
                { date: "12-10", new_work: 3, done: 12, undone: 4 },
                { date: "12-11", new_work: 5, done: 15, undone: 5 },
                { date: "12-12", new_work: 4, done: 13, undone: 6 },
                { date: "12-13", new_work: 6, done: 18, undone: 3 },
                { date: "12-14", new_work: 2, done: 11, undone: 7 },
                { date: "12-15", new_work: 5, done: 16, undone: 4 },
                { date: "12-16", new_work: 4, done: 14, undone: 5 },
            ],
            today_work: {
                done: 8,
                undone: 6,
                underway: 12,
            },
        },
        {
            user: "王芳",
            status: 1,
            work: [
                { date: "12-10", new_work: 4, done: 10, undone: 8 },
                { date: "12-11", new_work: 6, done: 12, undone: 6 },
                { date: "12-12", new_work: 3, done: 15, undone: 5 },
                { date: "12-13", new_work: 5, done: 17, undone: 4 },
                { date: "12-14", new_work: 4, done: 13, undone: 7 },
                { date: "12-15", new_work: 7, done: 19, undone: 3 },
                { date: "12-16", new_work: 5, done: 16, undone: 5 },
            ],
            today_work: {
                done: 7,
                undone: 8,
                underway: 10,
            },
        },
        {
            user: "张晨",
            status: 1,
            work: [
                { date: "12-10", new_work: 2, done: 9, undone: 10 },
                { date: "12-11", new_work: 3, done: 11, undone: 8 },
                { date: "12-12", new_work: 5, done: 14, undone: 6 },
                { date: "12-13", new_work: 4, done: 15, undone: 7 },
                { date: "12-14", new_work: 6, done: 16, undone: 5 },
                { date: "12-15", new_work: 3, done: 12, undone: 8 },
                { date: "12-16", new_work: 5, done: 17, undone: 4 },
            ],
            today_work: {
                done: 6,
                undone: 10,
                underway: 9,
            },
        },
        {
            user: "赵宁",
            status: 1,
            work: [
                { date: "12-10", new_work: 6, done: 18, undone: 3 },
                { date: "12-11", new_work: 5, done: 16, undone: 4 },
                { date: "12-12", new_work: 7, done: 21, undone: 2 },
                { date: "12-13", new_work: 4, done: 19, undone: 4 },
                { date: "12-14", new_work: 5, done: 18, undone: 5 },
                { date: "12-15", new_work: 6, done: 20, undone: 3 },
                { date: "12-16", new_work: 8, done: 22, undone: 2 },
            ],
            today_work: {
                done: 9,
                undone: 4,
                underway: 14,
            },
        },
        {
            user: "陈静",
            status: 1,
            work: [
                { date: "12-10", new_work: 4, done: 13, undone: 7 },
                { date: "12-11", new_work: 4, done: 14, undone: 6 },
                { date: "12-12", new_work: 3, done: 12, undone: 8 },
                { date: "12-13", new_work: 5, done: 15, undone: 6 },
                { date: "12-14", new_work: 6, done: 18, undone: 4 },
                { date: "12-15", new_work: 4, done: 16, undone: 5 },
                { date: "12-16", new_work: 5, done: 17, undone: 4 },
            ],
            today_work: {
                done: 7,
                undone: 7,
                underway: 11,
            },
        },
        {
            user: "周然",
            status: 1,
            work: [
                { date: "12-10", new_work: 5, done: 15, undone: 5 },
                { date: "12-11", new_work: 6, done: 17, undone: 4 },
                { date: "12-12", new_work: 4, done: 16, undone: 6 },
                { date: "12-13", new_work: 5, done: 18, undone: 5 },
                { date: "12-14", new_work: 7, done: 20, undone: 3 },
                { date: "12-15", new_work: 6, done: 19, undone: 4 },
                { date: "12-16", new_work: 5, done: 18, undone: 5 },
            ],
            today_work: {
                done: 8,
                undone: 5,
                underway: 13,
            },
        },
        {
            user: "孙悦",
            status: 1,
            work: [
                { date: "12-10", new_work: 3, done: 11, undone: 9 },
                { date: "12-11", new_work: 4, done: 13, undone: 7 },
                { date: "12-12", new_work: 5, done: 15, undone: 5 },
                { date: "12-13", new_work: 4, done: 14, undone: 7 },
                { date: "12-14", new_work: 5, done: 16, undone: 6 },
                { date: "12-15", new_work: 3, done: 13, undone: 8 },
                { date: "12-16", new_work: 4, done: 15, undone: 6 },
            ],
            today_work: {
                done: 6,
                undone: 9,
                underway: 8,
            },
        },
        {
            user: "吴浩",
            status: 1,
            work: [
                { date: "12-10", new_work: 6, done: 16, undone: 4 },
                { date: "12-11", new_work: 7, done: 18, undone: 3 },
                { date: "12-12", new_work: 5, done: 17, undone: 4 },
                { date: "12-13", new_work: 8, done: 22, undone: 2 },
                { date: "12-14", new_work: 6, done: 19, undone: 3 },
                { date: "12-15", new_work: 7, done: 21, undone: 2 },
                { date: "12-16", new_work: 6, done: 20, undone: 3 },
            ],
            today_work: {
                done: 9,
                undone: 3,
                underway: 15,
            },
        },
    ],
};

export function getWorkplaceIndex() {
    return localResponse(workplaceIndexData);
}

export function getWorkplaceMember(page: number) {
    const data: WorkplaceMemberData = {
        ...workplaceMemberData,
        page_current: page,
    };
    return localResponse(data);
}
